import { MaterialLineSchema, RegionSchema } from "@quatecalc/contracts";
import { createScanJob } from "@quatecalc/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  lines: z.array(MaterialLineSchema),
  region: RegionSchema,
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "קלט לא תקין", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const job = await createScanJob({ region: parsed.data.region, lines: parsed.data.lines });
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (err) {
    console.error("create scan job failed", err);
    return Response.json({ error: "לא ניתן ליצור משימת סריקה." }, { status: 500 });
  }
}
