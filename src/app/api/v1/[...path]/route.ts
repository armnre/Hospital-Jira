/**
 * Frontend → Backend API gateway.
 * - HWDT_BACKEND_URL set (Docker): proxy to the standalone Express service.
 * - otherwise (sandbox preview): start the same Express backend embedded on a loopback port and proxy to it.
 */
import { ensureEmbeddedBackend } from "@hwdt/backend/embedded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARD_REQUEST = ["authorization", "content-type", "accept", "user-agent"];
const DROP_RESPONSE = ["content-encoding", "content-length", "transfer-encoding", "connection"];

async function proxy(req: Request): Promise<Response> {
  let base: string;
  try {
    base = process.env.HWDT_BACKEND_URL ?? (await ensureEmbeddedBackend());
  } catch (e) {
    console.error("[hwdt-gateway] backend unavailable", e);
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", message: "Backend service is unavailable" } }, { status: 503 });
  }
  const url = new URL(req.url);
  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-forwarded-for", req.headers.get("x-forwarded-for") ?? "127.0.0.1");
  const res = await fetch(`${base}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });
  const out = new Headers(res.headers);
  for (const h of DROP_RESPONSE) out.delete(h);
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
