import type { CatalogStatus, Prisma, Region, Unit } from "@prisma/client";
import { prisma } from "../client.js";

export interface ProductSearchRow {
  id: string;
  supplierKey: string;
  sku: string | null;
  name: string;
  nameNormalized: string;
  unit: Unit;
  packSize: number;
  price: number;
  currency: string;
  region: Region;
  url: string;
  scrapedAt: Date;
  /** pg_trgm similarity score in [0,1]. */
  similarity: number;
}

/**
 * Fuzzy candidate search over the CURRENT catalog using pg_trgm similarity.
 * `normalizedQuery` must already be normalized (see @quatecalc/units normalizeHebrew).
 */
export async function searchCatalogByTrigram(params: {
  normalizedQuery: string;
  region: Region;
  limit?: number;
  minSimilarity?: number;
  /** Catalog statuses to search. Defaults to ['current']. */
  statuses?: CatalogStatus[];
}): Promise<ProductSearchRow[]> {
  const {
    normalizedQuery,
    region,
    limit = 10,
    minSimilarity = 0.1,
    statuses = ["current"],
  } = params;
  if (!normalizedQuery.trim()) return [];

  // similarity() comes from the pg_trgm extension.
  const rows = await prisma.$queryRaw<ProductSearchRow[]>`
    SELECT id, "supplierKey", sku, name, "nameNormalized", unit, "packSize",
           price, currency, region, url, "scrapedAt",
           similarity("nameNormalized", ${normalizedQuery}) AS similarity
    FROM "CatalogProduct"
    WHERE status::text = ANY(${statuses})
      AND region = ${region}::"Region"
      AND similarity("nameNormalized", ${normalizedQuery}) >= ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
  return rows;
}

/** Fetch products by ids (used to resolve match overrides / selections). */
export async function getProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.catalogProduct.findMany({ where: { id: { in: ids } } });
}

export type StagedProductInput = Omit<
  Prisma.CatalogProductCreateManyInput,
  "id" | "createdAt" | "status"
>;

/** Bulk-insert freshly scraped products in the `staged` state for a run. */
export async function insertStagedProducts(rows: StagedProductInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await prisma.catalogProduct.createMany({
    data: rows.map((r) => ({ ...r, status: "staged" as CatalogStatus })),
  });
  return res.count;
}

/**
 * Promote a healthy scrape run: archive the previous `current` rows for the
 * same supplier+region, then flip this run's `staged` rows to `current`.
 * Runs in a transaction so the catalog is never left empty.
 */
export async function promoteScrapeRun(params: {
  supplierKey: string;
  region: Region;
  scrapeRunId: string;
}): Promise<{ archived: number; promoted: number }> {
  const { supplierKey, region, scrapeRunId } = params;
  return prisma.$transaction(async (tx) => {
    const archived = await tx.catalogProduct.updateMany({
      where: { supplierKey, region, status: "current" },
      data: { status: "archived" },
    });
    const promoted = await tx.catalogProduct.updateMany({
      where: { supplierKey, region, status: "staged", scrapeRunId },
      data: { status: "current" },
    });
    return { archived: archived.count, promoted: promoted.count };
  });
}

/** Discard staged rows from a failed run so they don't accumulate. */
export async function discardStagedRun(scrapeRunId: string): Promise<number> {
  const res = await prisma.catalogProduct.deleteMany({
    where: { status: "staged", scrapeRunId },
  });
  return res.count;
}

/** Bulk-insert on-demand scan results as ephemeral `scanned` rows with a TTL. */
export async function insertScannedProducts(
  rows: StagedProductInput[],
  expiresAt: Date,
): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await prisma.catalogProduct.createMany({
    data: rows.map((r) => ({
      ...r,
      status: "scanned" as CatalogStatus,
      expiresAt,
    })),
  });
  return res.count;
}

/** Delete expired `scanned` rows. Returns the number removed. */
export async function pruneExpiredScanned(now: Date = new Date()): Promise<number> {
  const res = await prisma.catalogProduct.deleteMany({
    where: { status: "scanned", expiresAt: { lt: now } },
  });
  return res.count;
}
