import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../../app";
import { parse } from "../../common/validate";
import { authenticate, currentUser, permissionsFor } from "./rbac";
import { rateLimit } from "./rateLimit";
import { DEMO_ACCOUNTS, login } from "./auth.service";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export function authRoutes({ pool, config }: Deps): Router {
  const r = Router();
  const loginLimiter = rateLimit({
    windowMs: 5 * 60_000,
    max: 10,
    key: (req) => `${req.ip}|${String((req.body as { email?: unknown })?.email ?? "").toLowerCase()}`,
  });

  r.post("/auth/login", loginLimiter, async (req, res) => {
    const body = parse(loginSchema, req.body);
    res.json(await login(pool, config, body.email, body.password));
  });

  r.get("/auth/me", authenticate(config), (_req, res) => {
    const user = currentUser(res);
    res.json({ ...user, permissions: permissionsFor(user.role) });
  });

  /** Demo accounts are only disclosed when the built-in demo password is in use (local sandbox). */
  r.get("/auth/demo-accounts", (_req, res) => {
    res.json(
      config.exposeDemoCredentials
        ? { enabled: true, password: config.seedPassword, accounts: DEMO_ACCOUNTS.map(({ email, name, role }) => ({ email, name, role })) }
        : { enabled: false, accounts: [] },
    );
  });

  return r;
}
