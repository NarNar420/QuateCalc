import { saveOverride } from "@quatecalc/db";
import { normalizeHebrew } from "@quatecalc/units";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  rawText: z.string().min(1),
  productId: z.string().min(1),
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
    await saveOverride(normalizeHebrew(parsed.data.rawText), parsed.data.productId);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("saveOverride failed", err);
    return Response.json(
      { error: "שמירת ההתאמה נכשלה." },
      { status: 500 },
    );
  }
}
