import type { RawProduct } from "@quatecalc/contracts";
import type { StagedProductInput } from "@quatecalc/db";
import { normalizeHebrew, normalizeUnit } from "@quatecalc/units";

/**
 * Parse a messy supplier price string into a number of ILS, or null if it
 * can't be confidently parsed. Handles:
 *   "₪ 24.90", "24.90 ש\"ח", "1,234.50", "1.234,50" (euro-style), "28,90"
 */
export function parsePrice(priceRaw: string | null | undefined): number | null {
  if (priceRaw == null) return null;
  // Keep only digits, separators and a leading sign.
  const cleaned = priceRaw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // The last-occurring separator is the decimal; the other is thousands.
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // e.g. "1.234,50" -> dot=thousands, comma=decimal
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // e.g. "1,234.50" -> comma=thousands, dot=decimal
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only commas. Treat as decimal if it looks like one (e.g. "28,90"),
    // otherwise as thousands separators (e.g. "1,234").
    const parts = cleaned.split(",");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length !== 3) {
      normalized = cleaned.replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else {
    normalized = cleaned; // only dot(s) or plain digits
    // Multiple dots => treat all but the last as thousands separators.
    const dotCount = (normalized.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      const idx = normalized.lastIndexOf(".");
      normalized = normalized.slice(0, idx).replace(/\./g, "") + normalized.slice(idx);
    }
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Extra context the runner supplies when normalizing raw products. */
export interface NormalizeContext {
  supplierId: string;
  supplierKey: string;
  region: StagedProductInput["region"];
  scrapeRunId?: string;
  scrapedAt?: Date;
  currency?: string;
}

/**
 * Map a scraped `RawProduct` to the data-only shape `insertStagedProducts`
 * expects. Returns `{ row, priceParsed }` so the runner can track price-null
 * rate. Unit falls back to "piece"; packSize defaults to 1.
 */
export function rawToStagedProduct(
  raw: RawProduct,
  ctx: NormalizeContext,
): { row: StagedProductInput; priceParsed: number | null } {
  const priceParsed = parsePrice(raw.priceRaw);
  const unit = normalizeUnit(raw.unitRaw) ?? "piece";

  const row: StagedProductInput = {
    supplierId: ctx.supplierId,
    supplierKey: ctx.supplierKey,
    sku: raw.sku ?? null,
    name: raw.name,
    nameNormalized: normalizeHebrew(raw.name),
    unit,
    packSize: 1,
    price: priceParsed ?? 0,
    currency: ctx.currency ?? "ILS",
    region: raw.region ?? ctx.region,
    url: raw.url,
    scrapedAt: ctx.scrapedAt ?? new Date(),
    scrapeRunId: ctx.scrapeRunId,
  };

  return { row, priceParsed };
}
