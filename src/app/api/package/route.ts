import { spawn } from "node:child_process";
import path from "node:path";
import { PLATFORM_DIR } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** Streams the deployment package (without secrets, backups or git metadata) as a .tar.gz. */
export async function GET() {
  const parent = path.dirname(PLATFORM_DIR);
  const tar = spawn("tar", [
    "czf", "-",
    "--exclude=hospital-workforce-platform/.git",
    "--exclude=hospital-workforce-platform/.env",
    "--exclude=hospital-workforce-platform/postgres/backups/*_db",
    "--exclude=hospital-workforce-platform/postgres/backups/globals",
    "--exclude=hospital-workforce-platform/postgres/backups/.last_success",
    "--exclude=__pycache__",
    "-C", parent, "hospital-workforce-platform",
  ]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      tar.stdout.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      tar.stdout.on("end", () => controller.close());
      tar.on("error", (err) => controller.error(err));
    },
    cancel() {
      tar.kill();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": 'attachment; filename="hospital-workforce-platform-phase0.tar.gz"',
    },
  });
}
