import { ScanProgressSchema, type ScanJobView } from "@quatecalc/contracts";
import { getScanJob } from "@quatecalc/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getScanJob(id);
  if (!job) {
    return Response.json({ error: "משימה לא נמצאה" }, { status: 404 });
  }
  const view: ScanJobView = {
    id: job.id,
    region: job.region,
    status: job.status,
    progress: ScanProgressSchema.parse(job.progress ?? {}),
    items: (job.result as ScanJobView["items"]) ?? null,
    error: job.error,
  };
  return Response.json(view);
}
