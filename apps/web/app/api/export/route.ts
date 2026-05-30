import { ExportFormatSchema, QuoteSchema } from "@quatecalc/contracts";
import { exportQuote } from "@quatecalc/export";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  quote: QuoteSchema,
  format: ExportFormatSchema,
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
    const result = await exportQuote(parsed.data.quote, parsed.data.format);
    return new Response(new Uint8Array(result.data), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    console.error("export failed", err);
    return Response.json({ error: "הייצוא נכשל." }, { status: 500 });
  }
}
