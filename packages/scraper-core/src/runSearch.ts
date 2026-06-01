import type {
  RawProduct,
  ScraperAdapter,
  ScraperContext,
  ScrapeRegion,
  ScrapeRunResult,
  ScrapeRunStatus,
} from "@quatecalc/contracts";
import type { StagedProductInput } from "@quatecalc/db";
import { rawToStagedProduct } from "./normalize.js";

export interface RunSearchParams {
  adapter: ScraperAdapter;
  /** Free-text query term (normalization happens downstream). */
  query: string;
  ctx: ScraperContext;
  /** Supplier row id (caller upserts the supplier first). */
  supplierId: string;
  /** Safety cap on products per supplier per term. Default 25. */
  maxProducts?: number;
  /** Currency for normalized rows. Default "ILS". */
  currency?: string;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /** Fraction of unparseable prices above which the result is `failed`. Default 0.5. */
  maxNullPriceRate?: number;
}

export interface SearchResult {
  supplierKey: string;
  region: ScrapeRegion;
  query: string;
  /** Normalized rows, ready for db.insertScannedProducts. */
  products: StagedProductInput[];
  summary: ScrapeRunResult;
}

const DEFAULT_MAX_PRODUCTS = 25;
const DEFAULT_MAX_NULL_PRICE_RATE = 0.5;

/**
 * Drive an adapter's optional `searchProducts` for one term, normalizing each
 * yielded RawProduct into a staged-shaped row. DB-free: returns the rows for the
 * caller to persist as ephemeral `scanned` rows. Mirrors runScrape's health
 * accounting (productCount / errorCount / nullPriceRate / status), but never
 * promotes — search results are ephemeral.
 */
export async function runSearch(p: RunSearchParams): Promise<SearchResult> {
  const region = p.ctx.region;
  const now = p.now ?? (() => new Date());
  const currency = p.currency ?? "ILS";
  const maxProducts = p.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const maxNullPriceRate = p.maxNullPriceRate ?? DEFAULT_MAX_NULL_PRICE_RATE;
  const startedAt = now();

  const products: StagedProductInput[] = [];
  let productCount = 0;
  let errorCount = 0;
  let nullPriceCount = 0;
  let notes: string | undefined;

  if (typeof p.adapter.searchProducts !== "function") {
    const finishedAt = now();
    return {
      supplierKey: p.adapter.supplierKey,
      region,
      query: p.query,
      products: [],
      summary: {
        supplierKey: p.adapter.supplierKey,
        region,
        startedAt,
        finishedAt,
        status: "success",
        productCount: 0,
        errorCount: 0,
        nullPriceRate: 0,
        promoted: false,
        notes: "adapter has no search capability",
      },
    };
  }

  try {
    for await (const raw of p.adapter.searchProducts(p.query, p.ctx)) {
      if (productCount >= maxProducts) break;
      try {
        const { row, priceParsed } = rawToStagedProduct(raw as RawProduct, {
          supplierId: p.supplierId,
          supplierKey: p.adapter.supplierKey,
          region,
          scrapedAt: startedAt,
          currency,
        });
        products.push(row);
        productCount++;
        if (priceParsed === null) nullPriceCount++;
      } catch (err) {
        errorCount++;
        p.ctx.log("warn", `normalize failed: ${String(err)}`);
      }
    }
  } catch (err) {
    errorCount++;
    p.ctx.log("error", `searchProducts failed: ${String(err)}`);
  }

  const nullPriceRate = productCount > 0 ? nullPriceCount / productCount : 0;

  let status: ScrapeRunStatus;
  if (productCount === 0) {
    status = errorCount > 0 ? "failed" : "success";
    if (errorCount > 0) notes = "search errored with no products";
  } else if (nullPriceRate > maxNullPriceRate) {
    status = "failed";
    notes = `nullPriceRate ${nullPriceRate.toFixed(2)} exceeds ${maxNullPriceRate}`;
  } else {
    status = errorCount > 0 ? "partial" : "success";
  }

  const finishedAt = now();
  return {
    supplierKey: p.adapter.supplierKey,
    region,
    query: p.query,
    products,
    summary: {
      supplierKey: p.adapter.supplierKey,
      region,
      startedAt,
      finishedAt,
      status,
      productCount,
      errorCount,
      nullPriceRate,
      promoted: false,
      notes,
    },
  };
}
