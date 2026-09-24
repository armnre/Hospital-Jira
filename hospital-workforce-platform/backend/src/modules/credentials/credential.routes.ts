import { Router } from "express";
import type { Deps } from "../../app";
import { parse, uuidParam } from "../../common/validate";
import { authorize, currentUser } from "../auth/rbac";
import { createCredentialSchema, listCredentialsQuery, updateCredentialSchema } from "./credential.schema";
import { credentialService } from "./credential.service";

/** HWDT-13 Credential CRUD · HWDT-14 Verification · HWDT-15 Expiry detection */
export function credentialRoutes({ pool }: Deps): Router {
  const r = Router();

  // Compliance endpoints (declared before /credentials/:id)
  r.get("/credentials/expiring", authorize("compliance:read"), async (_req, res) => {
    res.json(await credentialService.expiring(pool));
  });

  r.get("/credentials/expired", authorize("compliance:read"), async (_req, res) => {
    res.json(await credentialService.expired(pool));
  });

  r.get("/credentials", authorize("credentials:read"), async (req, res) => {
    res.json(await credentialService.list(pool, parse(listCredentialsQuery, req.query)));
  });

  r.get("/employees/:id/credentials", authorize("credentials:read", "employees:read:self"), async (req, res) => {
    const data = await credentialService.listForEmployee(pool, parse(uuidParam, req.params.id), currentUser(res));
    res.json({ count: data.length, data });
  });

  r.post("/employees/:id/credentials", authorize("credentials:write", "credentials:submit:self"), async (req, res) => {
    const created = await credentialService.create(pool, parse(uuidParam, req.params.id), parse(createCredentialSchema, req.body), currentUser(res));
    res.status(201).location(`/api/v1/credentials/${created.id}`).json(created);
  });

  r.put("/credentials/:id", authorize("credentials:write"), async (req, res) => {
    res.json(await credentialService.update(pool, parse(uuidParam, req.params.id), parse(updateCredentialSchema, req.body), currentUser(res)));
  });

  r.post("/credentials/:id/verify", authorize("credentials:verify"), async (req, res) => {
    res.json(await credentialService.verify(pool, parse(uuidParam, req.params.id), currentUser(res)));
  });

  r.delete("/credentials/:id", authorize("credentials:delete"), async (req, res) => {
    await credentialService.remove(pool, parse(uuidParam, req.params.id), currentUser(res));
    res.status(204).end();
  });

  return r;
}
