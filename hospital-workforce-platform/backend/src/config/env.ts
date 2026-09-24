import crypto from "node:crypto";

export type Config = {
  nodeEnv: string;
  databaseUrl: string;
  host: string;
  port: number;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  jwtIssuer: string;
  jwtAudience: string;
  seedDemo: boolean;
  seedPassword: string;
  exposeDemoCredentials: boolean;
  adminEmail: string | null;
  adminPassword: string | null;
  corsOrigins: string[];
  expiringSoonDays: number;
};

/** Built-in demo password (public by design — used ONLY when HWDT_SEED_DEMO=true and no override is given). */
export const DEFAULT_DEMO_PASSWORD = "Hwdt!Demo2026";

let ephemeralSecret: string | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.HWDT_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) throw new Error("HWDT_DATABASE_URL (or DATABASE_URL) is required");

  let jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    if (env.HWDT_REQUIRE_JWT_SECRET === "true") {
      throw new Error("JWT_SECRET must be set and at least 32 characters long");
    }
    ephemeralSecret ??= crypto.randomBytes(48).toString("base64url");
    jwtSecret = ephemeralSecret;
    console.warn("[hwdt-backend] JWT_SECRET not set — using an ephemeral per-process secret (tokens invalidate on restart)");
  }

  const seedDemo = (env.HWDT_SEED_DEMO ?? "true") === "true";
  const customSeedPassword = env.HWDT_SEED_PASSWORD && env.HWDT_SEED_PASSWORD.length >= 10 ? env.HWDT_SEED_PASSWORD : null;
  const expires = Number(env.JWT_EXPIRES_IN_SECONDS ?? 3600);

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    databaseUrl,
    host: env.HWDT_BACKEND_HOST ?? "0.0.0.0",
    port: Number(env.HWDT_BACKEND_PORT ?? 4000),
    jwtSecret,
    jwtExpiresInSeconds: Number.isFinite(expires) && expires >= 60 && expires <= 86400 ? expires : 3600,
    jwtIssuer: "hwdt-backend",
    jwtAudience: "hwdt-frontend",
    seedDemo,
    seedPassword: customSeedPassword ?? DEFAULT_DEMO_PASSWORD,
    exposeDemoCredentials: seedDemo && !customSeedPassword,
    adminEmail: env.HWDT_ADMIN_EMAIL ?? null,
    adminPassword: env.HWDT_ADMIN_PASSWORD ?? null,
    corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiringSoonDays: 60,
  };
}
