import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import { validationResults, validationRuns } from "@/db/schema";
import {
  PLATFORM_DIR,
  loadCompose,
  loadConfluenceConfig,
  loadJiraConfig,
  platformFileExists,
  readPlatformFile,
} from "@/lib/platform";
import { collectHostMetrics } from "@/lib/metrics";
import { bootstrap as bootstrapPhase1 } from "@hwdt/backend/bootstrap";
import { loadConfig as loadPhase1Config } from "@hwdt/backend/config/env";
import { createPool as createPhase1Pool } from "@hwdt/backend/db/pool";
import { computeCredentialStatus } from "@hwdt/backend/modules/credentials/credential.rules";
import { addDays, todayUtc } from "@hwdt/backend/common/dates";

const execFileAsync = promisify(execFile);

export type TestStatus = "PASS" | "FAIL" | "BLOCKED";
type TestOutcome = { status: TestStatus; details: string; evidence?: string };
type TestDef = { id: string; category: string; name: string; run: (ctx: Ctx) => Promise<TestOutcome> };

type Ctx = {
  env: NodeJS.ProcessEnv;
  pg: { host: string; port: string; user: string; password: string };
  jiraPassword: string;
  confluencePassword: string;
  hwdtPassword: string;
  dockerAvailable: boolean;
};

const pass = (details: string, evidence = ""): TestOutcome => ({ status: "PASS", details, evidence });
const fail = (details: string, evidence = ""): TestOutcome => ({ status: "FAIL", details, evidence });
const blocked = (details: string, evidence = ""): TestOutcome => ({ status: "BLOCKED", details, evidence });

async function sh(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeout = 120_000) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: PLATFORM_DIR, env, timeout, maxBuffer: 10 * 1024 * 1024 });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message: string };
    return { code: typeof err.code === "number" ? err.code : 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` || err.message };
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  const r = await sh("bash", ["-lc", `command -v ${cmd}`], process.env, 5000);
  return r.code === 0;
}

async function queryAs(ctx: Ctx, user: string, password: string, database: string, sql: string, params: unknown[] = []) {
  const client = new Client({ host: ctx.pg.host, port: Number(ctx.pg.port), user, password, database, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}
const adminQuery = (ctx: Ctx, database: string, sql: string, params: unknown[] = []) =>
  queryAs(ctx, ctx.pg.user, ctx.pg.password, database, sql, params);

async function httpStatus(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return `${res.status} ${(await res.text()).slice(0, 120)}`;
  } catch {
    return null;
  }
}

const tail = (s: string, n = 40) => s.trim().split("\n").slice(-n).join("\n");
const REQUIRED_SERVICES = ["postgres", "jira", "confluence", "nginx", "backup", "prometheus", "backend", "frontend"];
const NO_DOCKER =
  "Docker runtime is not available in this sandbox. This check runs on a Docker host via ./scripts/validate_environment.sh.";

// =============================================================================
// TEST CATALOGUE
// =============================================================================
const TESTS: TestDef[] = [
  // ---------------------------------------------------------------- Docker
  {
    id: "DOC-01", category: "Docker", name: "Compose file parses and declares all core services",
    run: async () => {
      const c = loadCompose();
      const names = Object.keys(c.services);
      const missing = REQUIRED_SERVICES.filter((s) => !names.includes(s));
      return missing.length ? fail(`Missing services: ${missing.join(", ")}`) : pass(`${names.length} services: ${names.join(", ")}`);
    },
  },
  {
    id: "DOC-02", category: "Docker", name: "Every long-running service has a restart policy",
    run: async () => {
      const c = loadCompose();
      const bad = Object.entries(c.services).filter(([, s]) => !s.profiles && s.restart !== "unless-stopped" && s.restart !== "always");
      const summary = Object.entries(c.services).filter(([, s]) => !s.profiles).map(([n, s]) => `${n}: ${s.restart}`).join("\n");
      return bad.length ? fail(`No restart policy: ${bad.map(([n]) => n).join(", ")}`, summary) : pass("All services use restart: unless-stopped", summary);
    },
  },
  {
    id: "DOC-03", category: "Docker", name: "Every long-running service has a health check",
    run: async () => {
      const c = loadCompose();
      const rows = Object.entries(c.services).filter(([, s]) => !s.profiles);
      const bad = rows.filter(([, s]) => !s.healthcheck?.test);
      const ev = rows.map(([n, s]) => `${n}: ${JSON.stringify(s.healthcheck?.test ?? "none")}`).join("\n");
      return bad.length ? fail(`Missing health checks: ${bad.map(([n]) => n).join(", ")}`) : pass(`${rows.length}/${rows.length} services have health checks`, ev);
    },
  },
  {
    id: "DOC-04", category: "Docker", name: "Stateful services use declared persistent volumes",
    run: async () => {
      const c = loadCompose();
      const declared = Object.keys(c.volumes ?? {});
      const expect: Record<string, string> = { postgres: "postgres_data", jira: "jira_data", confluence: "confluence_data", prometheus: "prometheus_data" };
      const problems: string[] = [];
      const ev: string[] = [];
      for (const [svc, vol] of Object.entries(expect)) {
        const mounts = c.services[svc]?.volumes ?? [];
        const ok = mounts.some((m) => m.startsWith(`${vol}:`)) && declared.includes(vol);
        ev.push(`${svc} -> ${vol} ${ok ? "✓" : "✗"}`);
        if (!ok) problems.push(svc);
      }
      const backupBind = (c.services.backup?.volumes ?? []).some((m) => m.includes("postgres/backups"));
      ev.push(`backup -> ./postgres/backups ${backupBind ? "✓" : "✗"}`);
      if (!backupBind) problems.push("backup");
      return problems.length ? fail(`Missing persistence: ${problems.join(", ")}`, ev.join("\n")) : pass(`Named volumes: ${declared.join(", ")}`, ev.join("\n"));
    },
  },
  {
    id: "DOC-05", category: "Docker", name: ".env.example defines every variable referenced by docker-compose.yml",
    run: async () => {
      const compose = readPlatformFile("docker-compose.yml");
      const envEx = readPlatformFile(".env.example");
      const referenced = new Set([...compose.matchAll(/(?<!\$)\$\{([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]));
      const defined = new Set([...envEx.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]));
      const missing = [...referenced].filter((v) => !defined.has(v));
      return missing.length ? fail(`Undefined: ${missing.join(", ")}`) : pass(`${referenced.size} variables referenced, all defined in .env.example`, [...referenced].sort().join(", "));
    },
  },
  {
    id: "DOC-06", category: "Docker", name: "Containers start (docker compose up -d)",
    run: async (ctx) => {
      if (!ctx.dockerAvailable) return blocked(NO_DOCKER);
      const r = await sh("docker", ["compose", "ps", "--format", "{{.Service}} {{.State}} {{.Health}}"], ctx.env, 30_000);
      const lines = r.out.trim().split("\n").filter(Boolean);
      const bad = lines.filter((l) => !/running (healthy|)$/.test(l));
      return r.code === 0 && lines.length >= REQUIRED_SERVICES.length && bad.length === 0 ? pass(`${lines.length} containers running`, r.out) : fail("Some containers are not healthy", r.out);
    },
  },
  // ---------------------------------------------------------------- Scripts
  {
    id: "SCR-01", category: "Scripts", name: "All shell scripts pass bash -n and Python provisioners compile",
    run: async (ctx) => {
      const r = await sh("bash", ["-c",
        "set -e; for f in scripts/*.sh scripts/lib/*.sh postgres/init/*.sh; do bash -n \"$f\" && echo \"ok  $f\"; done; " +
        "python3 -c \"import ast,glob; [ast.parse(open(f).read(), f) or print('ok  '+f) for f in glob.glob('scripts/provision/*.py')]\""], ctx.env);
      return r.code === 0 ? pass(`${r.out.trim().split("\n").length} files verified`, r.out) : fail("Syntax error", r.out);
    },
  },
  // ---------------------------------------------------------------- Database
  {
    id: "DB-01", category: "Database", name: "PostgreSQL accepts connections",
    run: async (ctx) => {
      const rows = await adminQuery(ctx, "postgres", "select version() as v, current_setting('server_version') as sv");
      return pass(`PostgreSQL ${rows[0].sv} reachable at ${ctx.pg.host}:${ctx.pg.port}`, rows[0].v);
    },
  },
  {
    id: "DB-02", category: "Database", name: "Init script creates jira_db, confluence_db, jira_user, confluence_user (idempotent)",
    run: async (ctx) => {
      const first = await sh("bash", ["postgres/init/01-init-databases.sh"], ctx.env);
      if (first.code !== 0) return fail("Init script failed", tail(first.out));
      const second = await sh("bash", ["postgres/init/01-init-databases.sh"], ctx.env);
      if (second.code !== 0) return fail("Second (idempotent) run failed", tail(second.out));
      const rows = await adminQuery(ctx, "postgres",
        "select datname from pg_database where datname in ('jira_db','confluence_db') union all select rolname from pg_roles where rolname in ('jira_user','confluence_user') order by 1");
      const got = rows.map((r) => r.datname as string);
      const need = ["confluence_db", "confluence_user", "jira_db", "jira_user"];
      return need.every((n) => got.includes(n)) ? pass("Databases and roles present after two consecutive runs", tail(first.out, 30)) : fail(`Found only: ${got.join(", ")}`, first.out);
    },
  },
  {
    id: "DB-03", category: "Database", name: "Ownership, encoding and collation match Atlassian requirements",
    run: async (ctx) => {
      const rows = await adminQuery(ctx, "postgres",
        "select datname, pg_get_userbyid(datdba) as owner, pg_encoding_to_char(encoding) as enc, datcollate from pg_database where datname in ('jira_db','confluence_db') order by 1");
      const ev = rows.map((r) => `${r.datname}: owner=${r.owner} encoding=${r.enc} collate=${r.datcollate}`).join("\n");
      const jira = rows.find((r) => r.datname === "jira_db");
      const conf = rows.find((r) => r.datname === "confluence_db");
      const ok = jira?.owner === "jira_user" && jira?.datcollate === "C" && jira?.enc === "UTF8" && conf?.owner === "confluence_user" && conf?.enc === "UTF8";
      return ok ? pass("jira_db: C collation/UTF8; confluence_db: UTF8", ev) : fail("Unexpected database properties", ev);
    },
  },
  {
    id: "DB-04", category: "Database", name: "Credential isolation: each role can only access its own database",
    run: async (ctx) => {
      const ev: string[] = [];
      await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "select 1");
      ev.push("jira_user -> jira_db: allowed ✓");
      await queryAs(ctx, "confluence_user", ctx.confluencePassword, "confluence_db", "select 1");
      ev.push("confluence_user -> confluence_db: allowed ✓");
      for (const [u, p, d] of [["jira_user", ctx.jiraPassword, "confluence_db"], ["confluence_user", ctx.confluencePassword, "jira_db"]] as const) {
        try {
          await queryAs(ctx, u, p, d, "select 1");
          return fail(`${u} could connect to ${d}`, ev.join("\n"));
        } catch (e) {
          ev.push(`${u} -> ${d}: denied ✓ (${(e as Error).message})`);
        }
      }
      const su = await adminQuery(ctx, "postgres", "select rolname, rolsuper, rolcreatedb from pg_roles where rolname in ('jira_user','confluence_user')");
      if (su.some((r) => r.rolsuper || r.rolcreatedb)) return fail("Application role has elevated privileges", JSON.stringify(su));
      ev.push("application roles: NOSUPERUSER NOCREATEDB ✓");
      return pass("Least-privilege roles verified", ev.join("\n"));
    },
  },
  // ---------------------------------------------------------------- Phase 1
  {
    id: "P1-01", category: "Phase 1", name: "02-init-hwdt-app.sh creates hwdt_db owned by least-privilege hwdt_app (idempotent)",
    run: async (ctx) => {
      for (let i = 0; i < 2; i++) {
        const r = await sh("bash", ["postgres/init/02-init-hwdt-app.sh"], ctx.env);
        if (r.code !== 0) return fail(`Run ${i + 1} failed`, tail(r.out));
      }
      const rows = await adminQuery(ctx, "postgres", "select pg_get_userbyid(d.datdba) as owner, r.rolsuper, r.rolcreatedb from pg_database d join pg_roles r on r.rolname = 'hwdt_app' where d.datname = 'hwdt_db'");
      if (!rows[0]) return fail("hwdt_db not created");
      if (rows[0].owner !== "hwdt_app" || rows[0].rolsuper || rows[0].rolcreatedb) return fail("Unexpected ownership/privileges", JSON.stringify(rows[0]));
      try {
        await queryAs(ctx, "hwdt_app", ctx.hwdtPassword, "jira_db", "select 1");
        return fail("hwdt_app can connect to jira_db");
      } catch {
        /* expected */
      }
      return pass("hwdt_db owned by hwdt_app (NOSUPERUSER, NOCREATEDB); no access to jira_db");
    },
  },
  {
    id: "P1-02", category: "Phase 1", name: "Backend migrations + seed apply to hwdt_db as hwdt_app and are idempotent",
    run: async (ctx) => {
      const url = `postgresql://hwdt_app:${encodeURIComponent(ctx.hwdtPassword)}@${ctx.pg.host}:${ctx.pg.port}/hwdt_db`;
      const cfg = loadPhase1Config({ ...process.env, NODE_ENV: "production", HWDT_DATABASE_URL: url, HWDT_SEED_DEMO: "true", JWT_SECRET: crypto.randomBytes(32).toString("hex") });
      const pool = createPhase1Pool(cfg, 2);
      const logs: string[] = [];
      try {
        const first = await bootstrapPhase1(pool, cfg, (m) => logs.push(m));
        const second = await bootstrapPhase1(pool, cfg, (m) => logs.push(m));
        const tables = await pool.query<{ t: string }>("select table_schema || '.' || table_name as t from information_schema.tables where table_schema in ('platform','iam','workforce','credential') and table_type = 'BASE TABLE' order by 1");
        const counts = await pool.query<{ e: number; c: number; u: number }>("select (select count(*)::int from workforce.employees) e, (select count(*)::int from credential.credentials) c, (select count(*)::int from iam.users) u");
        const ev = `${logs.join("\n")}\n\ntables: ${tables.rows.map((r) => r.t).join(", ")}\nrows: employees=${counts.rows[0].e} credentials=${counts.rows[0].c} users=${counts.rows[0].u}`;
        if (second.migrations.applied.length) return fail("Second run re-applied migrations", ev);
        if (second.migrations.drift.length) return fail(`Checksum drift: ${second.migrations.drift.join(", ")}`, ev);
        return pass(`${first.migrations.applied.length + first.migrations.skipped.length} migrations, ${tables.rows.length} tables, idempotent re-run (0 applied)`, ev);
      } finally {
        await pool.end();
      }
    },
  },
  {
    id: "P1-03", category: "Phase 1", name: "Credential status rule: SQL compute_status() == TypeScript rules (-3…+65 days)",
    run: async (ctx) => {
      const today = todayUtc();
      const mismatches: string[] = [];
      let checked = 0;
      for (const verified of [true, false]) {
        for (let d = -3; d <= 65; d++) {
          const expiry = addDays(today, d);
          const rows = await queryAs(ctx, "hwdt_app", ctx.hwdtPassword, "hwdt_db", "select credential.compute_status($1::date, $2::timestamptz, $3::date) as s", [expiry, verified ? new Date() : null, today]);
          const ts = computeCredentialStatus({ expiryDate: expiry, verifiedAt: verified ? new Date() : null }, today);
          checked++;
          if (rows[0].s !== ts) mismatches.push(`d=${d} verified=${verified}: sql=${rows[0].s} ts=${ts}`);
        }
      }
      return mismatches.length ? fail(`${mismatches.length} mismatches`, mismatches.join("\n")) : pass(`${checked} boundary cases identical (60-day window, Rule 2 precedence)`);
    },
  },
  {
    id: "P1-04", category: "Phase 1", name: "Compose runs backend + frontend with health checks; nginx routes hwdt.local",
    run: async () => {
      const c = loadCompose();
      const be = c.services.backend;
      const fe = c.services.frontend;
      const problems: string[] = [];
      if (!be?.healthcheck || !fe?.healthcheck) problems.push("missing health checks");
      if (be?.restart !== "unless-stopped" || fe?.restart !== "unless-stopped") problems.push("restart policy");
      if (!be?.environment?.HWDT_DATABASE_URL?.includes("@postgres:5432/")) problems.push("backend not wired to postgres");
      if (fe?.environment?.HWDT_BACKEND_URL !== "http://backend:4000") problems.push("frontend not wired to backend");
      const vhost = readPlatformFile("nginx/config/conf.d/40-workforce.conf");
      if (!vhost.includes("server_name hwdt.local") || !vhost.includes("backend:4000") || !vhost.includes("frontend:3000")) problems.push("nginx vhost");
      for (const f of ["backend/Dockerfile", "frontend/Dockerfile", "backend/package.json", "frontend/package.json"]) if (!platformFileExists(f)) problems.push(`${f} missing`);
      return problems.length ? fail(problems.join("; ")) : pass("backend:4000 → postgres/hwdt_db, frontend:3000 → backend, hwdt.local vhost (/api/v1 → backend)");
    },
  },
  // ---------------------------------------------------------------- Backup / Restore
  {
    id: "BAK-01", category: "Backup", name: "backup_database.sh creates checksummed dumps of jira_db and confluence_db",
    run: async (ctx) => {
      await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db",
        "create table if not exists hwdt_canary(id serial primary key, note text not null, created_at timestamptz default now())");
      await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "truncate hwdt_canary; insert into hwdt_canary(note) select 'canary-' || g from generate_series(1, 500) g");
      await queryAs(ctx, "confluence_user", ctx.confluencePassword, "confluence_db",
        "create table if not exists hwdt_canary(id serial primary key, page text not null); truncate hwdt_canary; insert into hwdt_canary(page) select 'page-' || g from generate_series(1, 120) g");
      const r = await sh("bash", ["scripts/backup_database.sh"], ctx.env);
      if (r.code !== 0) return fail("Backup script failed", tail(r.out));
      const dir = path.join(PLATFORM_DIR, "postgres/backups");
      const latest = (db: string) => fs.readdirSync(path.join(dir, db)).filter((f) => f.endsWith(".dump")).sort().pop();
      const files = ["jira_db", "confluence_db", "hwdt_db"].map((d) => `${d}/${latest(d)}`);
      const missingSum = files.filter((f) => !fs.existsSync(path.join(dir, `${f}.sha256`)));
      return missingSum.length ? fail("Checksum missing", r.out) : pass(`Created ${files.join(", ")} (+ .sha256, globals)`, tail(r.out));
    },
  },
  {
    id: "RST-01", category: "Restore", name: "test_restore.sh restores into scratch DBs and row counts match",
    run: async (ctx) => {
      const r = await sh("bash", ["scripts/test_restore.sh"], ctx.env);
      return r.code === 0 && r.out.includes("Restore test PASSED") ? pass("Scratch restore verified for jira_db, confluence_db and hwdt_db", tail(r.out)) : fail("Restore test failed", tail(r.out));
    },
  },
  {
    id: "RST-02", category: "Restore", name: "Disaster-recovery drill: data loss in jira_db recovered from backup",
    run: async (ctx) => {
      const before = await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "select count(*)::int as n from hwdt_canary");
      await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "delete from hwdt_canary");
      const lost = await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "select count(*)::int as n from hwdt_canary");
      const r = await sh("bash", ["scripts/restore_database.sh", "latest:jira_db", "jira_db", "--force"], ctx.env);
      if (r.code !== 0) return fail("restore_database.sh failed", tail(r.out));
      const after = await queryAs(ctx, "jira_user", ctx.jiraPassword, "jira_db", "select count(*)::int as n from hwdt_canary");
      const props = await adminQuery(ctx, "postgres", "select pg_get_userbyid(datdba) as owner, datcollate from pg_database where datname = 'jira_db'");
      const tableOwner = await adminQuery(ctx, "jira_db", "select tableowner from pg_tables where tablename = 'hwdt_canary'");
      const ev = `rows before=${before[0].n}, after simulated loss=${lost[0].n}, after restore=${after[0].n}\ndb owner=${props[0]?.owner} collation=${props[0]?.datcollate} table owner=${tableOwner[0]?.tableowner}\n${tail(r.out, 15)}`;
      if (props[0]?.datcollate !== "C") return fail(`Restore changed jira_db collation to ${props[0]?.datcollate} (Jira requires C)`, ev);
      if (tableOwner[0]?.tableowner !== "jira_user") return fail("Restored table not owned by jira_user", ev);
      return after[0].n === before[0].n && lost[0].n === 0 ? pass(`${after[0].n}/${before[0].n} rows recovered; collation C and jira_user ownership preserved`, ev) : fail("Row count mismatch after restore", ev);
    },
  },
  // ---------------------------------------------------------------- Jira
  {
    id: "JIR-01", category: "Jira", name: "Project HWDT and the 8 required issue types are defined",
    run: async () => {
      const c = loadJiraConfig();
      const need = ["Epic", "Story", "Task", "Bug", "Test Case", "Change Request", "Incident", "Infrastructure Task"];
      const have = c.issueTypes.map((i) => i.name);
      const missing = need.filter((n) => !have.includes(n));
      if (c.project.key !== "HWDT" || c.project.name !== "Hospital Workforce Digital Twin") return fail(`Unexpected project ${c.project.key} / ${c.project.name}`);
      return missing.length ? fail(`Missing issue types: ${missing.join(", ")}`) : pass(`HWDT — ${c.project.name}; ${have.length} issue types`, have.join(", "));
    },
  },
  {
    id: "JIR-02", category: "Jira", name: "The 7 required custom fields are defined with valid Jira types",
    run: async () => {
      const c = loadJiraConfig();
      const need = ["Module", "Environment", "Release Version", "Priority Level", "Test Result", "Department", "Employee ID"];
      const missing = need.filter((n) => !c.customFields.some((f) => f.name === n));
      const badType = c.customFields.filter((f) => !f.type.startsWith("com.atlassian.jira.plugin.system.customfieldtypes:"));
      const ev = c.customFields.map((f) => `${f.name}: ${f.type.split(":")[1]}${f.options.length ? ` [${f.options.length} options]` : ""}`).join("\n");
      return missing.length || badType.length ? fail(`Missing: ${missing.join(", ")} Bad type: ${badType.map((f) => f.name).join(", ")}`, ev) : pass("All 7 custom fields defined", ev);
    },
  },
  {
    id: "JIR-03", category: "Jira", name: "Delivery and Bug workflows follow the required status sequence",
    run: async () => {
      const c = loadJiraConfig();
      const expected: Record<string, string[]> = {
        "HWDT Delivery Workflow": ["BACKLOG", "ANALYSIS", "READY FOR DEVELOPMENT", "DEVELOPMENT", "CODE REVIEW", "QA TEST", "UAT", "DONE"],
        "HWDT Bug Workflow": ["OPEN", "ANALYSIS", "FIXING", "TESTING", "CLOSED"],
      };
      const ev: string[] = [];
      for (const [name, seq] of Object.entries(expected)) {
        const wf = c.workflows.find((w) => w.name === name);
        if (!wf) return fail(`Workflow ${name} missing`);
        if (JSON.stringify(wf.statuses.map((s) => s.name)) !== JSON.stringify(seq)) return fail(`${name}: status order differs`);
        for (let i = 0; i < seq.length - 1; i++) {
          if (!wf.transitions.some((t) => t.from === seq[i] && t.to === seq[i + 1] && !t.backward)) return fail(`${name}: no forward transition ${seq[i]} → ${seq[i + 1]}`);
        }
        const invalid = wf.transitions.filter((t) => !seq.includes(t.from) || !seq.includes(t.to));
        if (invalid.length) return fail(`${name}: invalid transitions ${invalid.map((t) => t.name).join(", ")}`);
        const xml = readPlatformFile(`jira/configuration/workflows/${name.toLowerCase().replace(/ /g, "-")}.xml`);
        const steps = [...xml.matchAll(/<step id="\d+" name="([^"]+)">/g)].map((m) => m[1]);
        if (JSON.stringify(steps) !== JSON.stringify(seq)) return fail(`${name}: XML steps out of sync with JSON`);
        ev.push(`${name}: ${seq.join(" → ")} (${wf.transitions.length} transitions, XML in sync)`);
      }
      return pass("Both workflows valid and rendered to OSWorkflow XML", ev.join("\n"));
    },
  },
  {
    id: "JIR-04", category: "Jira", name: "Epics EPIC-001 … EPIC-008 are defined",
    run: async () => {
      const c = loadJiraConfig();
      const need = ["Infrastructure Foundation", "Employee Digital Profile", "Credential Management", "Shift Management", "Workforce Matching Engine", "Dashboard & Reporting", "AI Layer", "External Integration"];
      const bad = need.filter((n, i) => c.epics[i]?.name !== n || c.epics[i]?.ref !== `EPIC-00${i + 1}`);
      return bad.length ? fail(`Mismatch: ${bad.join(", ")}`) : pass("8 epics defined", c.epics.map((e) => `${e.ref} ${e.name}`).join("\n"));
    },
  },
  {
    id: "JIR-05", category: "Jira", name: "Jira accessible (http://jira.local/status)",
    run: async (ctx) => {
      const url = process.env.HWDT_JIRA_URL ?? "http://jira.local/status";
      const res = await httpStatus(url);
      if (res && /RUNNING|FIRST_RUN/.test(res)) return pass(`Jira responded: ${res}`);
      return ctx.dockerAvailable ? fail(`No healthy response from ${url}`, res ?? "") : blocked(NO_DOCKER, `GET ${url} -> ${res ?? "unreachable"}`);
    },
  },
  // ---------------------------------------------------------------- Confluence
  {
    id: "CNF-01", category: "Confluence", name: "Space and the 8 documentation pages are defined and convert to storage format",
    run: async (ctx) => {
      const c = loadConfluenceConfig();
      if (c.space.name !== "Hospital Workforce Digital Twin Documentation") return fail(`Unexpected space name ${c.space.name}`);
      const missing = c.pages.filter((p) => !platformFileExists(p.source));
      if (missing.length) return fail(`Missing sources: ${missing.map((p) => p.source).join(", ")}`);
      const r = await sh("python3", ["scripts/provision/provision_confluence.py", "--dry-run"], ctx.env);
      const converted = (r.out.match(/\[dry-run\]/g) ?? []).length;
      const required = ["System Architecture", "Backup Strategy", "Phase 1 Architecture", "Phase 1 Database Documentation", "Phase 1 API Documentation", "Phase 1 Business Rules"];
      const missingPages = required.filter((t) => !c.pages.some((p) => p.title === t));
      if (missingPages.length) return fail(`Missing pages: ${missingPages.join(", ")}`);
      return r.code === 0 && converted === c.pages.length ? pass(`Space ${c.space.key}: ${converted} pages converted (Phase 0 + Phase 1)`, tail(r.out)) : fail(`Converted ${converted}/${c.pages.length} pages`, r.out);
    },
  },
  {
    id: "CNF-02", category: "Confluence", name: "Confluence accessible (http://confluence.local/status)",
    run: async (ctx) => {
      const url = process.env.HWDT_CONFLUENCE_URL ?? "http://confluence.local/status";
      const res = await httpStatus(url);
      if (res && /RUNNING|FIRST_RUN/.test(res)) return pass(`Confluence responded: ${res}`);
      return ctx.dockerAvailable ? fail(`No healthy response from ${url}`, res ?? "") : blocked(NO_DOCKER, `GET ${url} -> ${res ?? "unreachable"}`);
    },
  },
  // ---------------------------------------------------------------- Networking
  {
    id: "NET-01", category: "Networking", name: "Nginx routes jira.local / confluence.local to the correct internal service:port",
    run: async () => {
      const c = loadCompose();
      const routes: [string, string, string][] = [["10-jira.conf", "jira.local", "jira"], ["20-confluence.conf", "confluence.local", "confluence"], ["30-monitoring.conf", "monitoring.local", "prometheus"]];
      const ev: string[] = [];
      for (const [file, host, svc] of routes) {
        const conf = readPlatformFile(`nginx/config/conf.d/${file}`);
        const sn = conf.match(/^\s*server_name\s+([^;]+);/m)?.[1];
        const up = conf.match(/set \$\w+ ([\w-]+):(\d+);/);
        if (sn !== host) return fail(`${file}: server_name ${sn} != ${host}`);
        if (!up || up[1] !== svc) return fail(`${file}: upstream ${up?.[1]} != ${svc}`);
        const exposed = c.services[svc]?.expose ?? [];
        if (!exposed.includes(up[2])) return fail(`${svc} does not expose port ${up[2]}`);
        if (!/proxy_pass http:\/\/\$\w+;/.test(conf)) return fail(`${file}: proxy_pass missing`);
        ev.push(`${host} → ${up[1]}:${up[2]} (service exposes ${exposed.join(",")}) ✓`);
      }
      const nginxNets = c.services.nginx?.networks;
      const backendShared = Array.isArray(nginxNets) && nginxNets.includes("hwdt_backend");
      ev.push(`nginx on hwdt_backend: ${backendShared ? "✓" : "✗"}; PostgreSQL published: ${c.services.postgres?.ports ? "yes ✗" : "no ✓"}`);
      return backendShared && !c.services.postgres?.ports ? pass("Host-based routing table consistent with compose services", ev.join("\n")) : fail("Network topology issue", ev.join("\n"));
    },
  },
  {
    id: "NET-02", category: "Networking", name: "Security headers applied to every virtual host; SSL-ready",
    run: async () => {
      const headers = readPlatformFile("nginx/config/snippets/security-headers.conf");
      const need = ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"];
      const missing = need.filter((h) => !headers.includes(`add_header ${h}`));
      const vhosts = ["10-jira.conf", "20-confluence.conf", "30-monitoring.conf"].filter((f) => !readPlatformFile(`nginx/config/conf.d/${f}`).includes("snippets/security-headers.conf"));
      const main = readPlatformFile("nginx/config/nginx.conf");
      const ssl = platformFileExists("nginx/config/snippets/ssl-params.conf") && readPlatformFile("docker-compose.yml").includes(":443");
      const ev = `headers: ${need.join(", ")}\nserver_tokens off: ${main.includes("server_tokens      off")}\nssl-params.conf + port 443 published: ${ssl}`;
      return missing.length || vhosts.length || !ssl ? fail(`Missing headers ${missing.join(",")} / vhosts ${vhosts.join(",")}`, ev) : pass("4 security headers on 3 vhosts, TLS config staged", ev);
    },
  },
  {
    id: "NET-03", category: "Networking", name: "Live internal routing through Nginx (Host header → container)",
    run: async (ctx) => {
      if (!ctx.dockerAvailable) return blocked(NO_DOCKER);
      const r = await sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-H", "Host: jira.local", "http://127.0.0.1/status"], ctx.env, 10_000);
      return /^(200|302|303)$/.test(r.out.trim()) ? pass(`jira.local → HTTP ${r.out}`) : fail(`jira.local → HTTP ${r.out}`);
    },
  },
  // ---------------------------------------------------------------- Monitoring
  {
    id: "MON-01", category: "Monitoring", name: "Prometheus scrapes containers + host; alert rules cover status/CPU/memory/disk",
    run: async () => {
      const prom = readPlatformFile("monitoring/prometheus/prometheus.yml");
      const alerts = readPlatformFile("monitoring/prometheus/alerts.yml");
      const jobs = ["cadvisor", "node-exporter"].filter((j) => !prom.includes(`job_name: ${j}`));
      const rules = ["ContainerDown", "ContainerHighCpu", "ContainerHighMemory", "HostHighCpu", "HostLowMemory", "HostDiskSpaceLow"];
      const missingRules = rules.filter((r) => !alerts.includes(`alert: ${r}`));
      return jobs.length || missingRules.length ? fail(`Missing jobs ${jobs.join(",")} rules ${missingRules.join(",")}`) : pass(`2 scrape jobs + ${rules.length} alert rules`, rules.join("\n"));
    },
  },
  {
    id: "MON-02", category: "Monitoring", name: "Host metrics collection (CPU, memory, disk) in this environment",
    run: async () => {
      const m = await collectHostMetrics();
      const ev = `cpu cores=${m.cpu.cores} load1=${m.cpu.load1.toFixed(2)} usage≈${m.cpu.usagePct.toFixed(1)}%\nmemory used=${m.memory.usedPct.toFixed(1)}% of ${(m.memory.totalBytes / 2 ** 30).toFixed(1)} GiB\ndisk used=${m.disk.usedPct.toFixed(1)}% of ${(m.disk.totalBytes / 2 ** 30).toFixed(1)} GiB`;
      return m.disk.totalBytes > 0 ? pass("CPU, memory and disk metrics collected", ev) : fail("Could not read disk metrics", ev);
    },
  },
  // ---------------------------------------------------------------- Version control
  {
    id: "GIT-01", category: "Version Control", name: "Git repository with README, .gitignore, .env.example and deployment docs",
    run: async (ctx) => {
      const r = await sh("git", ["log", "--oneline", "-n", "5"], ctx.env, 10_000);
      if (r.code !== 0) return fail("Not a git repository (run scripts/init_git.sh)", r.out);
      const files = await sh("git", ["ls-files"], ctx.env, 10_000);
      const tracked = files.out.split("\n");
      const need = ["README.md", ".gitignore", ".env.example", "docs/06-deployment-guide.md", "docker-compose.yml"];
      const missing = need.filter((f) => !tracked.includes(f));
      return missing.length ? fail(`Untracked: ${missing.join(", ")}`) : pass(`${tracked.filter(Boolean).length} tracked files`, r.out);
    },
  },
  {
    id: "GIT-02", category: "Version Control", name: "No secrets inside the repository",
    run: async (ctx) => {
      const files = (await sh("git", ["ls-files"], ctx.env, 10_000)).out.split("\n").filter(Boolean);
      const problems: string[] = [];
      if (files.some((f) => f === ".env" || /\.(pem|key|crt|dump)$/.test(f))) problems.push("secret/backup file tracked");
      const gi = readPlatformFile(".gitignore");
      if (!/^\.env$/m.test(gi)) problems.push(".env not ignored");
      for (const f of files) {
        if (f.endsWith(".md")) continue;
        const txt = fs.readFileSync(path.join(PLATFORM_DIR, f), "utf8");
        for (const m of txt.matchAll(/^[ \t]*([A-Z_]*(?:PASSWORD|SECRET|TOKEN|LICENSE_KEY))[ \t]*[=:][ \t]*(\S*)/gm)) {
          const v = m[2];
          // boolean feature flags (e.g. HWDT_REQUIRE_JWT_SECRET: "true") are not secrets
          if (/^["']?(true|false)["']?$/.test(v)) continue;
          if (v !== "" && !/^(change_me|\$\{|\$|"\$|""|'')/.test(v)) problems.push(`${f}: ${m[1]} has a literal value (${v.slice(0, 4)}…)`);
        }
      }
      return problems.length ? fail(problems.join("; ")) : pass(`${files.length} tracked files scanned; only change_me placeholders / \${VAR} references found`);
    },
  },
];

// =============================================================================
// RUNNER
// =============================================================================
let running = false;
export const isRunning = () => running;

function pgFromUrl() {
  const u = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres");
  return { host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

export async function runValidation(triggeredBy = "control-center"): Promise<number> {
  if (running) throw new Error("A validation run is already in progress");
  running = true;
  const pg = pgFromUrl();
  const dockerAvailable = await commandExists("docker");
  const jiraPassword = crypto.randomBytes(18).toString("base64url");
  const confluencePassword = crypto.randomBytes(18).toString("base64url");
  const hwdtPassword = crypto.randomBytes(18).toString("base64url");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HWDT_ENV_LOADED: "1",
    BACKUP_MODE: "direct",
    PGHOST: pg.host, PGPORT: pg.port, PGUSER: pg.user, PGPASSWORD: pg.password,
    POSTGRES_USER: pg.user, POSTGRES_DB: "postgres",
    JIRA_DB_PASSWORD: jiraPassword, CONFLUENCE_DB_PASSWORD: confluencePassword, HWDT_DB_PASSWORD: hwdtPassword,
    BACKUP_RETENTION_DAYS: "7",
  };
  const envDesc = `${os.hostname()} · ${os.platform()} ${os.release()} · node ${process.version} · docker ${dockerAvailable ? "available" : "not available"} · PostgreSQL ${pg.host}:${pg.port}`;
  const [run] = await db.insert(validationRuns).values({ environment: envDesc, triggeredBy }).returning();
  const ctx: Ctx = { env, pg, jiraPassword, confluencePassword, hwdtPassword, dockerAvailable };
  let passed = 0, failed = 0, blockedN = 0;
  try {
    for (const [i, t] of TESTS.entries()) {
      const start = Date.now();
      let outcome: TestOutcome;
      try {
        outcome = await t.run(ctx);
      } catch (e) {
        outcome = fail(`Unhandled error: ${(e as Error).message}`, (e as Error).stack ?? "");
      }
      if (outcome.status === "PASS") passed++; else if (outcome.status === "FAIL") failed++; else blockedN++;
      await db.insert(validationResults).values({
        runId: run.id, category: t.category, testId: t.id, name: t.name, status: outcome.status,
        durationMs: Date.now() - start, details: outcome.details, evidence: (outcome.evidence ?? "").slice(0, 8000), position: i,
      });
    }
  } finally {
    await db.update(validationRuns).set({
      finishedAt: new Date(), passed, failed, blocked: blockedN,
      status: failed > 0 ? "failed" : blockedN > 0 ? "passed-with-blocked" : "passed",
    }).where(eq(validationRuns.id, run.id));
    running = false;
  }
  return run.id;
}

export async function getLatestRun() {
  const [run] = await db.select().from(validationRuns).orderBy(desc(validationRuns.id)).limit(1);
  if (!run) return null;
  const results = await db.select().from(validationResults).where(eq(validationResults.runId, run.id)).orderBy(validationResults.position);
  return { run, results };
}

export async function getRun(id: number) {
  const [run] = await db.select().from(validationRuns).where(eq(validationRuns.id, id));
  if (!run) return null;
  const results = await db.select().from(validationResults).where(eq(validationResults.runId, id)).orderBy(validationResults.position);
  return { run, results };
}

export async function listRuns(limit = 20) {
  return db.select().from(validationRuns).orderBy(desc(validationRuns.id)).limit(limit);
}

export const TEST_CATALOGUE = TESTS.map(({ id, category, name }) => ({ id, category, name }));
