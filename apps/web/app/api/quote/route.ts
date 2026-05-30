import { QuoteInputSchema } from "@quatecalc/contracts";
import { saveQuote } from "@quatecalc/db";
import { computeQuote } from "@quatecalc/pricing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  const parsed = QuoteInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "קלט לא תקין", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let quote;
  try {
    quote = computeQuote(parsed.data);
  } catch (err) {
    console.error("computeQuote failed", err);
    return Response.json({ error: "חישוב הצעת המחיר נכשל." }, { status: 400 });
  }

  // Best-effort persistence — never block returning the computed quote.
  try {
    await saveQuote({
      title: quote.title,
      customerName: quote.customerName,
      region: quote.region,
      currency: quote.currency,
      marginPercent: quote.pricing.marginPercent,
      vatPercent: quote.pricing.vatPercent,
      overhead: quote.pricing.overhead.items,
      totals: quote.totals,
      lines: quote.lines.map((line, order) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        order,
      })),
    });
  } catch (err) {
    console.warn("saveQuote failed (continuing)", err);
  }

  return Response.json(quote);
}
