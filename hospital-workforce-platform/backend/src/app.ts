import express, { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type { Config } from "./config/env";
import { errorHandler, notFoundHandler } from "./common/errors";
import { authRoutes } from "./modules/auth/auth.routes";
import { authenticate } from "./modules/auth/rbac";
import { complianceRoutes } from "./modules/compliance/compliance.routes";
import { credentialRoutes } from "./modules/credentials/credential.routes";
import { employeeRoutes } from "./modules/employees/employee.routes";
import { referenceRoutes } from "./modules/reference/reference.routes";
import { shiftRoutes } from "./modules/shifts/shift.routes";

/** Dependencies injected into every module (swap for per-service pools when splitting into microservices). */
export type Deps = { pool: Pool; config: Config };

export const API_VERSION = "v1";

const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  next();
};

function cors(origins: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function createApp(deps: Deps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback, uniquelocal");
  app.use(securityHeaders);
  app.use(cors(deps.config.corsOrigins));
  app.use(express.json({ limit: "100kb" }));

  const api = Router();
  api.get("/health", async (_req, res) => {
    const started = Date.now();
    await deps.pool.query("SELECT 1");
    res.json({ status: "ok", service: "hwdt-backend", version: API_VERSION, db: "ok", latencyMs: Date.now() - started });
  });
  api.use(authRoutes(deps)); // public: /auth/login, /auth/demo-accounts
  api.use(authenticate(deps.config)); // every route below requires a valid, unexpired JWT
  api.use(employeeRoutes(deps));
  api.use(credentialRoutes(deps));
  api.use(referenceRoutes(deps));
  api.use(complianceRoutes(deps));
  api.use(shiftRoutes(deps));

  app.use(`/api/${API_VERSION}`, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
