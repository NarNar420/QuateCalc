import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
  ScrapeRegion,
  ScrapeRunResult,
  ScrapeRunStatus,
} from "@quatecalc/contracts";
import {
  discardStagedRun as dbDiscardStagedRun,
  finishScrapeRun as dbFinishScrapeRun,
  insertStagedProducts as dbInsertStagedProducts,
  promoteScrapeRun as dbPromoteScrapeRun,
  startScrapeRun as dbStartScrapeRun,
  upsertSupplier as dbUpsertSupplier,
  type StagedProductInput,
} from "@quatecalc/db";
import { rawToStagedProduct } from "./normalize.js";

/**
 * The subset of `@quatecalc/db` the runner needs. Defaults to the real DB
 * functions, but tests inject in-memory fakes so the orchestration can be
 * asserted WITHOUT touching a real database.
 */
export interface RunnerDeps {
  upsertSupplier: typeof dbUpsertSupplier;
  startScrapeRun: typeof dbStartScrapeRun;
  insertStagedProducts: typeof dbInsertStagedProducts;
  promoteScrapeRun: typeof dbPromoteScrapeRun;
  discardStagedRun: typeof dbDiscardStagedRun;
  finishScrapeRun: typeof dbFinishScrapeRun;
}

const defaultDeps: RunnerDeps = {
  upsertSupplier: dbUpsertSupplier,
  startScrapeRun: dbStartScrapeRun,
  insertStagedProducts: dbInsertStagedProducts,
  promoteScrapeRun: dbPromoteScrapeRun,
  discardStagedRun: dbDiscardStagedRun,
  finishScrapeRun: dbFinishScrapeRun,
};

export interface RunScrapeOptions {
  /** Override any/all DB calls (for tests). */
  deps?: Partial<RunnerDeps>;
  /** A ready-made context; if omitted, the caller MUST pass `buildContext`. */
  ctx?: ScraperContext;
  /** Factory to build a context for the run (e.g. wiring fetchText). */
  buildContext?: (region: ScrapeRegion) => ScraperContext;
  /** Currency for staged rows. Defaults to "ILS". */
  currency?: string;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /** Fraction of unparseable prices above which the run is considered broken. */
  maxNullPriceRate?: number;
  /**
   * Optional predicate to limit which discovered categories are scraped.
   * Default (undefined) scrapes every category — existing behavior.
   */
  categoryFilter?: (category: CategoryRef) => boolean;
}

/** Default no-op logger when a context is built by the runner. */
function noopLog(): void {
  /* no-op */
}

const DEFAULT_MAX_NULL_PRICE_RATE = 0.5;

/**
 * Orchestrate a full scrape run for one adapter + region and return its health
 * summary. Implements the HEALTH GATE: a run yielding 0 products or too many
 * unparseable prices is marked `failed` and its staged rows are discarded so a
 * previously-good catalog is never wiped.
 */
export async function runScrape(
  adapter: ScraperAdapter,
  region: ScrapeRegion,
  options: RunScrapeOptions = {},
): Promise<ScrapeRunResult> {
  const deps: RunnerDeps = { ...defaultDeps, ...options.deps };
  const now = options.now ?? (() => new Date());
  const currency = options.currency ?? "ILS";
  const maxNullPriceRate = options.maxNullPriceRate ?? DEFAULT_MAX_NULL_PRICE_RATE;

  const startedAt = now();

  const ctx: ScraperContext =
    options.ctx ??
    (options.buildContext
      ? options.buildContext(region)
      : (() => {
          throw new Error("runScrape requires either options.ctx or options.buildContext");
        })());

  // 1. Ensure supplier + open a run.
  const supplier = await deps.upsertSupplier({
    key: adapter.supplierKey,
    name: adapter.supplierName,
    baseUrl: adapter.baseUrl,
  });
  const run = await deps.startScrapeRun({
    supplierId: supplier.id,
    supplierKey: adapter.supplierKey,
    region,
  });

  let productCount = 0;
  let errorCount = 0;
  let nullPriceCount = 0;
  const rows: StagedProductInput[] = [];

  // 2. Discover categories, then iterate products in each.
  let categories: CategoryRef[] = [];
  try {
    categories = await adapter.listCategories(ctx);
  } catch (err) {
    errorCount++;
    ctx.log("error", `listCategories failed: ${String(err)}`);
  }

  if (options.categoryFilter) {
    const before = categories.length;
    categories = categories.filter(options.categoryFilter);
    ctx.log("info", `categoryFilter kept ${categories.length}/${before} categories`);
  }

  for (const category of categories) {
    try {
      for await (const raw of adapter.scrapeCategory(category, ctx)) {
        try {
          const { row, priceParsed } = rawToStagedProduct(raw as RawProduct, {
            supplierId: supplier.id,
            supplierKey: adapter.supplierKey,
            region,
            scrapeRunId: run.id,
            scrapedAt: startedAt,
            currency,
          });
          rows.push(row);
          productCount++;
          if (priceParsed === null) nullPriceCount++;
        } catch (err) {
          errorCount++;
          ctx.log("warn", `normalize failed: ${String(err)}`);
        }
      }
    } catch (err) {
      errorCount++;
      ctx.log("error", `scrapeCategory failed for ${category.key}: ${String(err)}`);
    }
  }

  const nullPriceRate = productCount > 0 ? nullPriceCount / productCount : 0;

  // 4. Stage the rows (best-effort; staging failure is fatal for promotion).
  let staged = 0;
  if (rows.length > 0) {
    try {
      staged = await deps.insertStagedProducts(rows);
    } catch (err) {
      errorCount++;
      ctx.log("error", `insertStagedProducts failed: ${String(err)}`);
    }
  }

  // 5. HEALTH GATE.
  const unhealthy =
    productCount === 0 || nullPriceRate > maxNullPriceRate || staged === 0;

  let status: ScrapeRunStatus;
  let promoted: boolean;
  let notes: string | undefined;

  if (unhealthy) {
    status = "failed";
    promoted = false;
    if (productCount === 0) notes = "no products scraped";
    else if (staged === 0) notes = "no products staged";
    else notes = `nullPriceRate ${nullPriceRate.toFixed(2)} exceeds ${maxNullPriceRate}`;
    // Never wipe the good catalog: discard staged, do NOT promote.
    try {
      await deps.discardStagedRun(run.id);
    } catch (err) {
      ctx.log("error", `discardStagedRun failed: ${String(err)}`);
    }
  } else {
    promoted = true;
    status = errorCount > 0 ? "partial" : "success";
    try {
      await deps.promoteScrapeRun({
        supplierKey: adapter.supplierKey,
        region,
        scrapeRunId: run.id,
      });
    } catch (err) {
      // Promotion failed => don't claim success; discard to stay consistent.
      errorCount++;
      promoted = false;
      status = "failed";
      notes = `promote failed: ${String(err)}`;
      try {
        await deps.discardStagedRun(run.id);
      } catch {
        /* best effort */
      }
    }
  }

  const finishedAt = now();

  // 6. Finalize the run record.
  await deps.finishScrapeRun(run.id, {
    status,
    productCount,
    errorCount,
    nullPriceRate,
    promoted,
    notes,
  });

  return {
    supplierKey: adapter.supplierKey,
    region,
    startedAt,
    finishedAt,
    status,
    productCount,
    errorCount,
    nullPriceRate,
    promoted,
    notes,
  };
}
