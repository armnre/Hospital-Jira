import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../../app";
import { audit } from "../../common/audit";
import { AppError, notFound } from "../../common/errors";
import { intParam, parse, text } from "../../common/validate";
import { authorize, currentUser } from "../auth/rbac";

/** HWDT-11 Department Management · HWDT-12 Skill Management */
const departmentSchema = z.object({
  name: text(2, 100),
  nameFa: z.string().trim().min(2).max(150).optional(),
  nameEn: z.string().trim().max(150).optional(),
  code: z.string().trim().max(30).optional(),
  type: z.string().trim().max(60).default("GENERAL"),
  active: z.boolean().default(true),
  description: z.string().trim().max(500).default("")
}).strict();
const skillSchema = z.object({ name: text(2, 100), category: text(2, 60) }).strict();

export function referenceRoutes({ pool }: Deps): Router {
  const r = Router();

  // ------------------------------------------------------------- departments
  r.get("/departments", async (_req, res) => {
    const { rows } = await pool.query<{ id: number; name: string; name_fa: string | null; name_en: string | null; code: string | null; type: string; active: boolean; description: string; headcount: number; clinical_count: number }>(
      `SELECT d.id, d.name, d.name_fa, d.name_en, d.code, d.type, d.active, d.description,
              count(e.id)::int AS headcount,
              count(e.id) FILTER (WHERE e.employee_category = 'CLINICAL')::int AS clinical_count
         FROM workforce.departments d
         LEFT JOIN workforce.employees e ON e.department_id = d.id AND e.deleted_at IS NULL
        GROUP BY d.id ORDER BY d.name`,
    );
    res.json({ data: rows.map((d) => ({ id: d.id, name: d.name, name_fa: d.name_fa, name_en: d.name_en, code: d.code, type: d.type, active: d.active, description: d.description, headcount: d.headcount, clinicalCount: d.clinical_count })) });
  });

  r.post("/departments", authorize("reference:write"), async (req, res) => {
    const body = parse(departmentSchema, req.body);
    const { rows } = await pool.query(
      "INSERT INTO workforce.departments (name, name_fa, name_en, code, type, active, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, name_fa, name_en, code, type, active, description",
      [body.name, body.nameFa ?? body.name, body.nameEn ?? body.name, body.code ?? body.name.slice(0, 8).toUpperCase(), body.type, body.active, body.description],
    );
    await audit(pool, currentUser(res), "DEPARTMENT_CREATED", "department", rows[0].id, body);
    res.status(201).json(rows[0]);
  });

  r.put("/departments/:id", authorize("reference:write"), async (req, res) => {
    const id = parse(intParam, req.params.id);
    const body = parse(departmentSchema, req.body);
    const { rows } = await pool.query(
      "UPDATE workforce.departments SET name = $2, name_fa = $3, name_en = $4, code = $5, type = $6, active = $7, description = $8 WHERE id = $1 RETURNING id, name, name_fa, name_en, code, type, active, description",
      [id, body.name, body.nameFa ?? body.name, body.nameEn ?? body.name, body.code ?? body.name.slice(0, 8).toUpperCase(), body.type, body.active, body.description],
    );
    if (!rows[0]) throw notFound("Department");
    await audit(pool, currentUser(res), "DEPARTMENT_UPDATED", "department", id, body);
    res.json(rows[0]);
  });

  r.delete("/departments/:id", authorize("reference:write"), async (req, res) => {
    const id = parse(intParam, req.params.id);
    const used = await pool.query("SELECT count(*)::int AS n FROM workforce.employees WHERE department_id = $1", [id]);
    if (used.rows[0].n > 0) throw new AppError(409, "DEPARTMENT_IN_USE", `Department still has ${used.rows[0].n} employee record(s)`);
    const del = await pool.query("DELETE FROM workforce.departments WHERE id = $1", [id]);
    if (!del.rowCount) throw notFound("Department");
    await audit(pool, currentUser(res), "DEPARTMENT_DELETED", "department", id);
    res.status(204).end();
  });

  // ------------------------------------------------------------- skills
  r.get("/skills", async (_req, res) => {
    const { rows } = await pool.query<{ id: number; name: string; category: string; employee_count: number }>(
      `SELECT s.id, s.name, s.category, count(es.employee_id)::int AS employee_count
         FROM workforce.skills s LEFT JOIN workforce.employee_skills es ON es.skill_id = s.id
        GROUP BY s.id ORDER BY s.category, s.name`,
    );
    res.json({ data: rows.map((s) => ({ id: s.id, name: s.name, category: s.category, employeeCount: s.employee_count })) });
  });

  /** Who holds a skill, and at what level: the lookup the Phase 2 matching engine will build on. */
  r.get("/skills/:id/employees", authorize("employees:read"), async (req, res) => {
    const id = parse(intParam, req.params.id);
    const skill = await pool.query<{ id: number; name: string; category: string }>("SELECT id, name, category FROM workforce.skills WHERE id = $1", [id]);
    if (!skill.rows[0]) throw notFound("Skill");
    const { rows } = await pool.query<{ id: string; employee_number: string; first_name: string; last_name: string; department: string; job_title: string; level: string; years_experience: number }>(
      `SELECT e.id, e.employee_number, e.first_name, e.last_name, d.name AS department, e.job_title, es.level, es.years_experience
         FROM workforce.employee_skills es
         JOIN workforce.employees e ON e.id = es.employee_id AND e.deleted_at IS NULL
         JOIN workforce.departments d ON d.id = e.department_id
        WHERE es.skill_id = $1
        ORDER BY array_position(ARRAY['EXPERT','ADVANCED','INTERMEDIATE','BEGINNER']::varchar[], es.level), es.years_experience DESC`,
      [id],
    );
    res.json({
      skill: skill.rows[0],
      count: rows.length,
      data: rows.map((r) => ({ employeeId: r.id, employeeNumber: r.employee_number, fullName: `${r.first_name} ${r.last_name}`, department: r.department, jobTitle: r.job_title, level: r.level, yearsExperience: r.years_experience })),
    });
  });

  r.post("/skills", authorize("reference:write"), async (req, res) => {
    const body = parse(skillSchema, req.body);
    const { rows } = await pool.query("INSERT INTO workforce.skills (name, category) VALUES ($1, $2) RETURNING id, name, category", [body.name, body.category]);
    await audit(pool, currentUser(res), "SKILL_CREATED", "skill", rows[0].id, body);
    res.status(201).json(rows[0]);
  });

  r.put("/skills/:id", authorize("reference:write"), async (req, res) => {
    const id = parse(intParam, req.params.id);
    const body = parse(skillSchema, req.body);
    const { rows } = await pool.query("UPDATE workforce.skills SET name = $2, category = $3 WHERE id = $1 RETURNING id, name, category", [id, body.name, body.category]);
    if (!rows[0]) throw notFound("Skill");
    await audit(pool, currentUser(res), "SKILL_UPDATED", "skill", id, body);
    res.json(rows[0]);
  });

  r.delete("/skills/:id", authorize("reference:write"), async (req, res) => {
    const id = parse(intParam, req.params.id);
    const del = await pool.query("DELETE FROM workforce.skills WHERE id = $1", [id]);
    if (!del.rowCount) throw notFound("Skill");
    await audit(pool, currentUser(res), "SKILL_DELETED", "skill", id);
    res.status(204).end();
  });

  return r;
}
