import { z } from "zod";
import { RegionSchema } from "./common.js";
import type { RawProduct } from "./product.js";

/**
 * A category/listing reference that an adapter knows how to crawl.
 */
export const CategoryRefSchema = z.object({
  /** Stable id within the supplier, e.g. a category slug. */
  key: z.string(),
  /** Human label (Hebrew). */
  label: z.string(),
  /** Absolute URL of the category listing page. */
  url: z.string().url(),
});
export type CategoryRef = z.infer<typeof CategoryRefSchema>;

/**
 * Runtime services the runner injects into an adapter. Adapters MUST use
 * `ctx.fetch` (not global fetch) so rate-limiting, caching, robots.txt and the
 * polite User-Agent are enforced centrally.
 */
export interface ScraperContext {
  /** Polite, rate-limited, cached fetch for HTML pages. Returns page text. */
  fetchText(url: string): Promise<string>;
  /** Region currently being scraped (adapters may ignore if not regional). */
  region: ScrapeRegion;
  /** Structured logger scoped to the current run. */
  log: (level: "debug" | "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) => void;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

export const ScrapeRegionSchema = RegionSchema;
export type ScrapeRegion = z.infer<typeof ScrapeRegionSchema>;

/**
 * ScraperAdapter — the central contract that lets supplier adapters be built
 * in parallel and registered independently. One implementation per supplier.
 */
export interface ScraperAdapter {
  /** Stable supplier key, e.g. "ace" or "homecenter". */
  readonly supplierKey: string;
  /** Display name (Hebrew ok). */
  readonly supplierName: string;
  /** Site root, used for robots.txt resolution and URL joining. */
  readonly baseUrl: string;

  /** Discover the categories/listings to crawl for this run. */
  listCategories(ctx: ScraperContext): Promise<CategoryRef[]>;

  /**
   * Stream products for a single category. Implementations should yield
   * RawProduct objects and handle their own pagination using ctx.fetchText.
   */
  scrapeCategory(category: CategoryRef, ctx: ScraperContext): AsyncIterable<RawProduct>;

  /**
   * Search the supplier's own product search for `query` and stream matching
   * products. Optional: adapters whose supplier has no usable product search
   * omit this — the on-demand search engine skips them.
   */
  searchProducts?(query: string, ctx: ScraperContext): AsyncIterable<RawProduct>;
}

/** Outcome status of a single scrape run. */
export const ScrapeRunStatusSchema = z.enum(["success", "partial", "failed"]);
export type ScrapeRunStatus = z.infer<typeof ScrapeRunStatusSchema>;

/** Health/summary record produced by the runner for each scrape run. */
export const ScrapeRunResultSchema = z.object({
  supplierKey: z.string(),
  region: RegionSchema,
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date(),
  status: ScrapeRunStatusSchema,
  productCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  /** Fraction (0..1) of products missing a parsed price; high => likely breakage. */
  nullPriceRate: z.number().min(0).max(1),
  /** Whether the staged catalog was promoted to current. */
  promoted: z.boolean(),
  notes: z.string().optional(),
});
export type ScrapeRunResult = z.infer<typeof ScrapeRunResultSchema>;
