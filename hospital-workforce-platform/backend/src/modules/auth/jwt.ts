import jwt from "jsonwebtoken";
import type { Config } from "../../config/env";
import { unauthorized } from "../../common/errors";
import { ROLES, type Role } from "./rbac";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
};

type Claims = { email: string; name: string; role: Role; emp: string | null };

export function signAccessToken(user: AuthUser, config: Pick<Config, "jwtSecret" | "jwtExpiresInSeconds" | "jwtIssuer" | "jwtAudience">) {
  const claims: Claims = { email: user.email, name: user.name, role: user.role, emp: user.employeeId };
  const token = jwt.sign(claims, config.jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.jwtExpiresInSeconds,
  });
  return { token, expiresIn: config.jwtExpiresInSeconds, expiresAt: new Date(Date.now() + config.jwtExpiresInSeconds * 1000).toISOString() };
}

export function verifyAccessToken(token: string, config: Pick<Config, "jwtSecret" | "jwtIssuer" | "jwtAudience">): AuthUser {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
    if (typeof payload === "string" || !payload.sub) throw unauthorized("Invalid token", "INVALID_TOKEN");
    const p = payload as jwt.JwtPayload & Partial<Claims>;
    if (!p.role || !(ROLES as readonly string[]).includes(p.role)) throw unauthorized("Invalid token", "INVALID_TOKEN");
    return { id: p.sub as string, email: p.email ?? "", name: p.name ?? "", role: p.role, employeeId: p.emp ?? null };
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw unauthorized("Session expired — please sign in again", "TOKEN_EXPIRED");
    if (e instanceof jwt.JsonWebTokenError) throw unauthorized("Invalid token", "INVALID_TOKEN");
    throw e;
  }
}
