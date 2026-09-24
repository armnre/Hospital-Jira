import { Router } from "express";
import type { Deps } from "../../app";
import { intParam, parse, uuidParam } from "../../common/validate";
import { authorize, currentUser } from "../auth/rbac";
import { employeeRepository } from "./employee.repository";
import { createEmployeeSchema, employeeSkillSchema, listEmployeesQuery, updateEmployeeSchema } from "./employee.schema";
import { employeeService } from "./employee.service";

/** HWDT-9 Employee CRUD + HWDT-12 employee skills */
export function employeeRoutes({ pool }: Deps): Router {
  const r = Router();

  r.get("/employees", authorize("employees:read"), async (req, res) => {
    res.json(await employeeService.list(pool, parse(listEmployeesQuery, req.query), currentUser(res)));
  });

  r.get("/employees/job-titles", authorize("employees:read"), async (_req, res) => {
    res.json({ data: await employeeRepository.jobTitles(pool) });
  });

  r.get("/employees/:id", authorize("employees:read", "employees:read:self"), async (req, res) => {
    res.json(await employeeService.get(pool, parse(uuidParam, req.params.id), currentUser(res)));
  });

  r.post("/employees", authorize("employees:write"), async (req, res) => {
    const created = await employeeService.create(pool, parse(createEmployeeSchema, req.body), currentUser(res));
    res.status(201).location(`/api/v1/employees/${created.id}`).json(created);
  });

  r.put("/employees/:id", authorize("employees:write"), async (req, res) => {
    res.json(await employeeService.update(pool, parse(uuidParam, req.params.id), parse(updateEmployeeSchema, req.body), currentUser(res)));
  });

  r.delete("/employees/:id", authorize("employees:delete"), async (req, res) => {
    await employeeService.remove(pool, parse(uuidParam, req.params.id), currentUser(res));
    res.status(204).end();
  });

  r.post("/employees/:id/skills", authorize("employees:write"), async (req, res) => {
    const skills = await employeeService.upsertSkill(pool, parse(uuidParam, req.params.id), parse(employeeSkillSchema, req.body), currentUser(res));
    res.status(201).json({ data: skills });
  });

  r.delete("/employees/:id/skills/:skillId", authorize("employees:write"), async (req, res) => {
    await employeeService.removeSkill(pool, parse(uuidParam, req.params.id), parse(intParam, req.params.skillId), currentUser(res));
    res.status(204).end();
  });

  return r;
}
