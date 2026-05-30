import { MaterialLineSchema, RegionSchema } from "@quatecalc/contracts";
import { matchLines } from "@quatecalc/matching";
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
    const items = await matchLines(parsed.data.lines, {
      region: parsed.data.region,
    });
    return Response.json({ items });
  } catch (err) {
    console.error("match failed", err);
    return Response.json(
      { error: "ההתאמה נכשלה. ייתכן שמסד הנתונים אינו זמין." },
      { status: 500 },
    );
  }
}
