import { RegionSchema, DEFAULT_REGION } from "@quatecalc/contracts";
import { searchCatalogByTrigram } from "@quatecalc/db";
import { normalizeHebrew } from "@quatecalc/units";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const regionRaw = searchParams.get("region") ?? DEFAULT_REGION;

  const regionParsed = RegionSchema.safeParse(regionRaw);
  if (!regionParsed.success) {
    return Response.json({ error: "אזור לא תקין" }, { status: 400 });
  }

  const normalizedQuery = normalizeHebrew(q);
  if (!normalizedQuery) {
    return Response.json({ products: [] });
  }

  try {
    const rows = await searchCatalogByTrigram({
      normalizedQuery,
      region: regionParsed.data,
      limit: 15,
    });
    return Response.json({ products: rows });
  } catch (err) {
    console.error("catalog search failed", err);
    return Response.json(
      { error: "החיפוש נכשל. ייתכן שמסד הנתונים אינו זמין." },
      { status: 500 },
    );
  }
}
