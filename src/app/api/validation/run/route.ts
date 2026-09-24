import { getRun, isRunning, runValidation } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (isRunning()) {
    return Response.json({ error: "A validation run is already in progress" }, { status: 409 });
  }
  try {
    const id = await runValidation("control-center");
    return Response.json(await getRun(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
