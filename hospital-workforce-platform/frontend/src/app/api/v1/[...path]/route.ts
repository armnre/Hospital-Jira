/** Docker frontend gateway: forwards /api/v1/* to the backend service (HWDT_BACKEND_URL). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARD = ["authorization", "content-type", "accept", "user-agent"];

async function proxy(req: Request): Promise<Response> {
  const base = process.env.HWDT_BACKEND_URL ?? "http://backend:4000";
  const url = new URL(req.url);
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  try {
    const res = await fetch(`${base}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
      cache: "no-store",
    });
    const out = new Headers(res.headers);
    ["content-encoding", "content-length", "transfer-encoding", "connection"].forEach((h) => out.delete(h));
    return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", message: "Backend service is unavailable" } }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
