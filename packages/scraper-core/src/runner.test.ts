import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RunnerDeps } from "./runner.js";
import { runScrape } from "./runner.js";

/** Build an in-memory set of DB fakes plus spies to assert orchestration. */
function makeFakeDeps(): {
  deps: RunnerDeps;
  calls: {
    promote: ReturnType<typeof vi.fn>;
    discard: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    finish: ReturnType<typeof vi.fn>;
  };
  staged: unknown[];
} {
  const staged: unknown[] = [];
  const promote = vi.fn(async () => ({ archived: 0, promoted: staged.length }));
  const discard = vi.fn(async () => {
    const n = staged.length;
    staged.length = 0;
    return n;
  });
  const insert = vi.fn(async (rows: unknown[]) => {
    staged.push(...rows);
    return rows.length;
  });
  const finish = vi.fn(async (_id: string, data: unknown) => data);

  const deps: RunnerDeps = {
    upsertSupplier: vi.fn(async () => ({ id: "sup-1" }) as never),
    startScrapeRun: vi.fn(async () => ({ id: "run-1" }) as never),
    insertStagedProducts: insert as never,
    promoteScrapeRun: promote as never,
    discardStagedRun: discard as never,
    finishScrapeRun: finish as never,
  };

  return { deps, calls: { promote, discard, insert, finish }, staged };
}

function makeCtx(): ScraperContext {
  return {
    fetchText: vi.fn(async () => "<html></html>"),
    region: "center",
    log: () => {},
  };
}

/** A fake adapter that yields the given products from a single category. */
function makeAdapter(products: RawProduct[]): ScraperAdapter {
  const category: CategoryRef = {
    key: "cat-1",
    label: "מלט ודבק",
    url: "https://www.example.com/c/1",
  };
  return {
    supplierKey: "fake",
    supplierName: "Fake Supplier",
    baseUrl: "https://www.example.com",
    async listCategories(ctx) {
      // exercise fetchText so we know the ctx wiring works
      await ctx.fetchText(category.url);
      return [category];
    },
    async *scrapeCategory(_cat, _ctx) {
      for (const p of products) yield p;
    },
  };
}

const goodProducts: RawProduct[] = [
  { name: 'מלט אפור 25 ק"ג', priceRaw: "₪ 28.90", unitRaw: "שק", url: "https://www.example.com/p/1" },
  { name: 'דבק לאריחים 25 ק"ג', priceRaw: "₪ 42.50", unitRaw: "שק", url: "https://www.example.com/p/2" },
  { name: 'לוח גבס 12.5 מ"מ', priceRaw: '34,90 ש"ח', unitRaw: "לוח", url: "https://www.example.com/p/3" },
];

describe("runScrape", () => {
  it("promotes a healthy run and returns success with correct counts", async () => {
    const { deps, calls, staged } = makeFakeDeps();
    const result = await runScrape(makeAdapter(goodProducts), "center", {
      deps,
      ctx: makeCtx(),
    });

    expect(result.status).toBe("success");
    expect(result.promoted).toBe(true);
    expect(result.productCount).toBe(3);
    expect(result.errorCount).toBe(0);
    expect(result.nullPriceRate).toBe(0);
    expect(calls.insert).toHaveBeenCalledOnce();
    expect(calls.promote).toHaveBeenCalledOnce();
    expect(calls.discard).not.toHaveBeenCalled();
    expect(staged).toHaveLength(3);
    expect(calls.finish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "success", promoted: true, productCount: 3 }),
    );
  });

  it("fails a zero-product run, discards and does NOT promote", async () => {
    const { deps, calls } = makeFakeDeps();
    const result = await runScrape(makeAdapter([]), "center", {
      deps,
      ctx: makeCtx(),
    });

    expect(result.status).toBe("failed");
    expect(result.promoted).toBe(false);
    expect(result.productCount).toBe(0);
    expect(calls.promote).not.toHaveBeenCalled();
    expect(calls.discard).toHaveBeenCalledOnce();
  });

  it("fails when too many prices are unparseable (health gate)", async () => {
    const bad: RawProduct[] = [
      { name: "א", priceRaw: "אזל", url: "https://www.example.com/p/1" },
      { name: "ב", priceRaw: "לא זמין", url: "https://www.example.com/p/2" },
      { name: "ג", priceRaw: "₪ 10.00", url: "https://www.example.com/p/3" },
    ];
    const { deps, calls } = makeFakeDeps();
    const result = await runScrape(makeAdapter(bad), "center", { deps, ctx: makeCtx() });

    expect(result.nullPriceRate).toBeCloseTo(2 / 3, 5);
    expect(result.status).toBe("failed");
    expect(result.promoted).toBe(false);
    expect(calls.promote).not.toHaveBeenCalled();
    expect(calls.discard).toHaveBeenCalledOnce();
  });

  it("returns partial (still promotes) when a category errors but products exist", async () => {
    const adapter = makeAdapter(goodProducts);
    const original = adapter.listCategories.bind(adapter);
    adapter.listCategories = async (ctx) => {
      const cats = await original(ctx);
      return [...cats, { key: "bad", label: "x", url: "https://www.example.com/c/bad" }];
    };
    const origScrape = adapter.scrapeCategory.bind(adapter);
    adapter.scrapeCategory = (cat, ctx) => {
      if (cat.key === "bad") {
        // eslint-disable-next-line require-yield
        return (async function* () {
          throw new Error("boom");
        })();
      }
      return origScrape(cat, ctx);
    };

    const { deps, calls } = makeFakeDeps();
    const result = await runScrape(adapter, "center", { deps, ctx: makeCtx() });

    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.status).toBe("partial");
    expect(result.promoted).toBe(true);
    expect(calls.promote).toHaveBeenCalledOnce();
  });

  it("applies categoryFilter to limit which categories are scraped", async () => {
    // Adapter exposing TWO categories, each yielding one product.
    const twoCatAdapter: ScraperAdapter = {
      supplierKey: "fake",
      supplierName: "Fake Supplier",
      baseUrl: "https://www.example.com",
      async listCategories() {
        return [
          { key: "paints", label: "צבעים", url: "https://www.example.com/c/paints" },
          { key: "tools", label: "כלים", url: "https://www.example.com/c/tools" },
        ];
      },
      async *scrapeCategory(cat) {
        yield {
          name: `מוצר ${cat.key}`,
          priceRaw: "₪ 10.00",
          url: `https://www.example.com/p/${cat.key}`,
        };
      },
    };

    const { deps, staged } = makeFakeDeps();
    const result = await runScrape(twoCatAdapter, "center", {
      deps,
      ctx: makeCtx(),
      categoryFilter: (c) => c.key === "paints",
    });

    expect(result.productCount).toBe(1);
    expect((staged[0] as { name: string }).name).toBe("מוצר paints");
  });

  it("scrapes all categories when no categoryFilter is given (unchanged default)", async () => {
    const twoCatAdapter: ScraperAdapter = {
      supplierKey: "fake",
      supplierName: "Fake Supplier",
      baseUrl: "https://www.example.com",
      async listCategories() {
        return [
          { key: "paints", label: "צבעים", url: "https://www.example.com/c/paints" },
          { key: "tools", label: "כלים", url: "https://www.example.com/c/tools" },
        ];
      },
      async *scrapeCategory(cat) {
        yield {
          name: `מוצר ${cat.key}`,
          priceRaw: "₪ 10.00",
          url: `https://www.example.com/p/${cat.key}`,
        };
      },
    };

    const { deps } = makeFakeDeps();
    const result = await runScrape(twoCatAdapter, "center", { deps, ctx: makeCtx() });
    expect(result.productCount).toBe(2);
  });
});
