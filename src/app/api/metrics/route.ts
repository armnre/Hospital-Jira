import { collectHostMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await collectHostMetrics());
}
