import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const PLATFORM_DIR = path.join(process.cwd(), "hospital-workforce-platform");

export function platformPath(rel: string): string {
  const resolved = path.resolve(PLATFORM_DIR, rel);
  if (!resolved.startsWith(PLATFORM_DIR)) throw new Error("Path escapes platform directory");
  return resolved;
}

export function readPlatformFile(rel: string): string {
  return fs.readFileSync(platformPath(rel), "utf8");
}

export function platformFileExists(rel: string): boolean {
  try {
    return fs.existsSync(platformPath(rel));
  } catch {
    return false;
  }
}

export function readPlatformJson<T>(rel: string): T {
  return JSON.parse(readPlatformFile(rel)) as T;
}

const EXCLUDED_DIRS = new Set([".git", "__pycache__"]);

export type PlatformFile = { path: string; size: number };

/** Recursively list repository files (runtime backups are summarised separately). */
export function listPlatformFiles(dir = ""): PlatformFile[] {
  const abs = platformPath(dir);
  const out: PlatformFile[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (rel === "postgres/backups") {
        out.push({ path: "postgres/backups/.gitkeep", size: 0 });
        continue;
      }
      out.push(...listPlatformFiles(rel));
    } else {
      out.push({ path: rel, size: fs.statSync(path.join(abs, entry.name)).size });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------- compose
export type ComposeService = {
  image?: string;
  container_name?: string;
  restart?: string;
  healthcheck?: { test?: unknown; interval?: string; start_period?: string };
  volumes?: string[];
  ports?: string[];
  expose?: string[];
  profiles?: string[];
  depends_on?: Record<string, unknown> | string[];
  networks?: string[] | Record<string, unknown>;
  environment?: Record<string, string>;
};
export type ComposeFile = {
  name?: string;
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
};

export function loadCompose(): ComposeFile {
  return YAML.parse(readPlatformFile("docker-compose.yml"), { merge: true }) as ComposeFile;
}

// ---------------------------------------------------------------- jira / confluence config types
export type JiraConfig = {
  version: string;
  project: { key: string; name: string; description: string; projectTypeKey: string; projectTemplateKey: string; components: { name: string; description: string }[] };
  issueTypes: { name: string; type: string; builtIn: boolean; description: string; workflow: string }[];
  customFields: { name: string; type: string; searcherKey: string; description: string; options: string[]; issueTypes: string | string[] }[];
  versions: { name: string; description: string }[];
  workflows: {
    name: string;
    description: string;
    statuses: { name: string; category: string }[];
    transitions: { name: string; from: string; to: string; backward?: boolean; resolution?: boolean }[];
  }[];
  workflowScheme: { name: string; defaultWorkflow: string; mappings: Record<string, string> };
  permissionScheme: { name: string; groups: string[]; roles: { role: string; group: string; permissions: string[] }[] };
  epics: { ref: string; name: string; module: string; description: string }[];
};

export type ConfluenceConfig = {
  space: { key: string; name: string; description: string; permissions: Record<string, string[]> };
  labels: string[];
  pages: { order: number; title: string; source: string }[];
};

export const loadJiraConfig = () => readPlatformJson<JiraConfig>("jira/configuration/hwdt-project.json");
export const loadConfluenceConfig = () => readPlatformJson<ConfluenceConfig>("confluence/configuration/space.json");

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
