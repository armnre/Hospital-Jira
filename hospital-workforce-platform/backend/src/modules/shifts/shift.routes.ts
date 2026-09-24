import { Router } from "express";
import type { Deps } from "../../app";
import { parse, uuidParam } from "../../common/validate";
import { authorize, currentUser } from "../auth/rbac";
import {
  assignEmployeeSchema,
  createShiftInstanceSchema,
  createShiftTemplateSchema,
  listShiftsQuery,
  setAvailabilitySchema,
  updateShiftInstanceSchema,
  validateShiftSchema,
} from "./shift.schema";
import { shiftService } from "./shift.service";
import { availabilityService } from "./availability.service";

export function shiftRoutes({ pool }: Deps): Router {
  const r = Router();

  // ---------------------------------------------------------------------------
  // Supervisor Dashboard (صفحه داشبورد سرپرستار)
  // ---------------------------------------------------------------------------
  r.get("/supervisor/dashboard", authorize("supervisor:read"), async (req, res) => {
    const targetDate = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(await shiftService.getSupervisorDashboard(pool, targetDate));
  });

  // Coverage read model alias for the dashboard module and reporting clients.
  r.get("/coverage/dashboard", authorize("supervisor:read"), async (req, res) => {
    const targetDate = typeof req.query.date === "string" ? req.query.date : undefined;
    const dashboard = await shiftService.getSupervisorDashboard(pool, targetDate);
    res.json({ date: targetDate, ...dashboard });
  });

  // ---------------------------------------------------------------------------
  // Shift Templates (الگوهای شیفت)
  // ---------------------------------------------------------------------------
  r.get("/shift-templates", authorize("shifts:read"), async (req, res) => {
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    res.json({ data: await shiftService.listTemplates(pool, departmentId) });
  });

  r.post("/shift-templates", authorize("shifts:write"), async (req, res) => {
    const input = parse(createShiftTemplateSchema, req.body);
    const created = await shiftService.createTemplate(pool, input, currentUser(res));
    res.status(201).json(created);
  });

  // ---------------------------------------------------------------------------
  // Shift Instances (شیفت‌ها)
  // ---------------------------------------------------------------------------
  r.get("/shifts", authorize("shifts:read"), async (req, res) => {
    const query = parse(listShiftsQuery, req.query);
    res.json(await shiftService.list(pool, query));
  });

  r.post("/shifts", authorize("shifts:write"), async (req, res) => {
    const input = parse(createShiftInstanceSchema, req.body);
    const created = await shiftService.create(pool, input, currentUser(res));
    res.status(201).json(created);
  });

  r.get("/shifts/:id", authorize("shifts:read"), async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    res.json(await shiftService.get(pool, id));
  });

  r.put("/shifts/:id", authorize("shifts:write"), async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    const input = parse(updateShiftInstanceSchema, req.body);
    res.json(await shiftService.update(pool, id, input, currentUser(res)));
  });

  r.delete("/shifts/:id", authorize("shifts:delete"), async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    await shiftService.delete(pool, id, currentUser(res));
    res.status(204).end();
  });

  r.post("/shifts/:id/approve", authorize("shifts:approve"), async (req, res) => {
    const id = parse(uuidParam, req.params.id);
    res.json(await shiftService.approve(pool, id, currentUser(res)));
  });

  // ---------------------------------------------------------------------------
  // Validation API: Conflict Detection Engine (POST /shifts/{id}/validate)
  // ---------------------------------------------------------------------------
  r.post("/shifts/:id/validate", authorize("shifts:read"), async (req, res) => {
    const shiftId = parse(uuidParam, req.params.id);
    const { employeeId } = parse(validateShiftSchema, req.body);
    const result = await shiftService.validateCandidate(pool, shiftId, employeeId);
    res.json({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      details: result.details,
    });
  });

  // Candidate recommendation (AI preparation)
  r.get("/shifts/:id/candidates", authorize("shifts:read"), async (req, res) => {
    const shiftId = parse(uuidParam, req.params.id);
    res.json(await shiftService.getEligibleCandidates(pool, shiftId));
  });

  // ---------------------------------------------------------------------------
  // Shift Assignments (تخصیص شیفت)
  // ---------------------------------------------------------------------------
  r.get("/shifts/:id/assignments", authorize("shifts:read"), async (req, res) => {
    const shiftId = parse(uuidParam, req.params.id);
    res.json({ data: await shiftService.listAssignments(pool, shiftId) });
  });

  r.post("/shifts/:id/assign", authorize("assignments:write"), async (req, res) => {
    const shiftId = parse(uuidParam, req.params.id);
    const input = parse(assignEmployeeSchema, req.body);
    const result = await shiftService.assignEmployee(pool, shiftId, input, currentUser(res));
    res.status(201).json(result);
  });

  r.delete("/assignments/:id", authorize("assignments:write"), async (req, res) => {
    const assignmentId = parse(uuidParam, req.params.id);
    await shiftService.removeAssignment(pool, assignmentId, currentUser(res));
    res.status(204).end();
  });

  // ---------------------------------------------------------------------------
  // Employee Availability (دسترسی و مرخصی پرسنل)
  // ---------------------------------------------------------------------------
  r.post("/availability", authorize("availability:write", "availability:write:self"), async (req, res) => {
    const input = parse(setAvailabilitySchema, req.body);
    const user = currentUser(res);
    // If EMPLOYEE, verify they only modify their own availability
    if (user.role === "EMPLOYEE" && user.employeeId !== input.employeeId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "پرسنل تنها امکان ثبت دسترسی خود را دارد" } });
      return;
    }
    const result = await availabilityService.setAvailability(pool, input, user);
    res.status(201).json(result);
  });

  r.get("/employees/:id/availability", authorize("availability:read", "employees:read:self"), async (req, res) => {
    const employeeId = parse(uuidParam, req.params.id);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await availabilityService.getEmployeeAvailability(pool, employeeId, startDate, endDate));
  });

  r.get("/availability", authorize("availability:read"), async (req, res) => {
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    res.json(await availabilityService.listAvailability(pool, startDate, endDate, departmentId));
  });

  return r;
}
