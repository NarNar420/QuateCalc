import type { RawProduct, ScraperAdapter, ScraperContext } from "@quatecalc/contracts";
import { describe, expect, it } from "vitest";
import { runSearch } from "./runSearch.js";

function fakeCtx(): ScraperContext {
  return {
    fetchText: async () => "",
    region: "center",
    log: () => {},
  };
}

function adapterYielding(products: RawProduct[], withSearch = true): ScraperAdapter {
  const base: ScraperAdapter = {
    supplierKey: "fake",
    supplierName: "Fake",
    baseUrl: "https://fake.test",
    listCategories: async () => [],
    async *scrapeCategory() {},
  };
  if (!withSearch) return base;
  return {
    ...base,
    async *searchProducts() {
      for (const p of products) yield p;
    },
  };
}

const RAW = (name: string, price: string): RawProduct => ({
  name,
  priceRaw: price,
  url: "https://fake.test/p/" + encodeURIComponent(name),
});

describe("runSearch", () => {
  it("normalizes searched products into staged-shaped rows", async () => {
    const res = await runSearch({
      adapter: adapterYielding([RAW("מלט אפור", "₪19.90"), RAW("דבק", "₪8")]),
      query: "מלט",
      ctx: fakeCtx(),
      supplierId: "sup_1",
    });
    expect(res.products).toHaveLength(2);
    expect(res.products[0]!.supplierKey).toBe("fake");
    expect(res.products[0]!.price).toBeCloseTo(19.9);
    expect(res.products[0]!.region).toBe("center");
    expect(res.summary.status).toBe("success");
    expect(res.summary.productCount).toBe(2);
  });

  it("caps at maxProducts", async () => {
    const many = Array.from({ length: 10 }, (_, i) => RAW("פריט " + i, "₪" + (i + 1)));
    const res = await runSearch({
      adapter: adapterYielding(many),
      query: "x",
      ctx: fakeCtx(),
      supplierId: "sup_1",
      maxProducts: 3,
    });
    expect(res.products).toHaveLength(3);
  });

  it("returns an empty success result for an adapter without searchProducts", async () => {
    const res = await runSearch({
      adapter: adapterYielding([], false),
      query: "x",
      ctx: fakeCtx(),
      supplierId: "sup_1",
    });
    expect(res.products).toHaveLength(0);
    expect(res.summary.status).toBe("success");
    expect(res.summary.notes).toMatch(/no search capability/);
  });

  it("marks failed when every product has an unparseable price", async () => {
    const res = await runSearch({
      adapter: adapterYielding([RAW("x", "—"), RAW("y", "n/a")]),
      query: "x",
      ctx: fakeCtx(),
      supplierId: "sup_1",
    });
    expect(res.summary.nullPriceRate).toBe(1);
    expect(res.summary.status).toBe("failed");
  });
});
