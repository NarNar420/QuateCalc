import type { CatalogProduct } from "@quatecalc/contracts";
import type { ProductSearchRow } from "@quatecalc/db";
import { tokenizeHebrew } from "@quatecalc/units";

/**
 * Token-set overlap between two normalized strings.
 *
 * Blends Jaccard similarity with containment so that a short query that is
 * fully contained in a longer product name still scores highly (e.g. the query
 * "מלט אפור" against "מלט אפור CEM II 50 קג"). Returns a value in [0,1].
 */
export function tokenOverlap(queryNorm: string, productNameNorm: string): number {
  const q = new Set(tokenizeHebrew(queryNorm));
  const p = new Set(tokenizeHebrew(productNameNorm));
  if (q.size === 0 || p.size === 0) return 0;

  let intersection = 0;
  for (const t of q) {
    if (p.has(t)) intersection += 1;
  }
  if (intersection === 0) return 0;

  const union = q.size + p.size - intersection;
  const jaccard = intersection / union;
  // Containment relative to the smaller (usually the query) token set.
  const containment = intersection / Math.min(q.size, p.size);
  // Reward containment but keep Jaccard's penalty for noisy product names.
  return 0.5 * jaccard + 0.5 * containment;
}

/**
 * Blend pg_trgm character similarity with Hebrew token-set overlap into a single
 * confidence score in [0,1]. Token overlap is weighted higher because it is
 * more robust to character-level noise (numbers, supplier codes) in catalog
 * names, while trigram similarity rescues cases with no shared whole tokens.
 *
 * Pure: takes the trigram similarity as input so it is unit-testable with no DB.
 */
export function combinedScore(
  queryNorm: string,
  productNameNorm: string,
  trigramSim: number,
): number {
  const trigram = clamp01(trigramSim);
  const overlap = tokenOverlap(queryNorm, productNameNorm);
  const blended = 0.6 * overlap + 0.4 * trigram;
  return clamp01(blended);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Convert a DB search row (or any catalog-shaped row) into a CatalogProduct:
 * drop the `similarity` field and coerce `scrapedAt` to a Date.
 */
export function toCatalogProduct(row: ProductSearchRow | RowLike): CatalogProduct {
  const { similarity: _similarity, ...rest } = row as ProductSearchRow;
  return {
    id: rest.id,
    supplierKey: rest.supplierKey,
    sku: rest.sku ?? null,
    name: rest.name,
    nameNormalized: rest.nameNormalized,
    unit: rest.unit,
    packSize: rest.packSize ?? 1,
    price: rest.price,
    currency: rest.currency as CatalogProduct["currency"],
    region: rest.region,
    url: rest.url,
    scrapedAt: rest.scrapedAt instanceof Date ? rest.scrapedAt : new Date(rest.scrapedAt),
  };
}

/** Minimal shape needed to build a CatalogProduct (e.g. a Prisma row). */
export interface RowLike {
  id: string;
  supplierKey: string;
  sku?: string | null;
  name: string;
  nameNormalized: string;
  unit: CatalogProduct["unit"];
  packSize: number;
  price: number;
  currency: string;
  region: CatalogProduct["region"];
  url: string;
  scrapedAt: Date | string;
  similarity?: number;
}
