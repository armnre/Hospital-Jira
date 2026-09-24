import { getLatestRun, isRunning, listRuns } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const [latest, runs] = await Promise.all([getLatestRun(), listRuns(20)]);
  return Response.json({ running: isRunning(), latest, runs });
}
