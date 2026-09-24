import type { RequestHandler } from "express";

/** Minimal in-memory fixed-window limiter (single instance). Replace with Redis when scaling out. */
export function rateLimit(opts: { windowMs: number; max: number; key: (req: Parameters<RequestHandler>[0]) => string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const k = opts.key(req);
    const entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + opts.windowMs });
    } else if (++entry.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts — try again later" } });
      return;
    }
    if (hits.size > 10_000) for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
    next();
  };
}
