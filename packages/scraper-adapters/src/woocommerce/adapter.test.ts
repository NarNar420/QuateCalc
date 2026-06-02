import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { bniyahAdapter, createWooAdapter, sinaiAdapter, vakninAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

/** Stub ctx that serves a fixture for the seeded page-1 URL; any next page is empty. */
function fixtureCtx(seedPath: string, file: string): ScraperContext {
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => {
      const u = new URL(url);
      return u.pathname === seedPath && !u.search.includes("page") ? fixture(file) : "";
    },
  };
}

describe("createWooAdapter factory", () => {
  it("yields products over a fake ctx and stamps the region", async () => {
    const adapter = createWooAdapter({
      supplierKey: "vaknin",
      supplierName: "וקנין פרו",
      baseUrl: "https://www.vakninpro.co.il",
      categories: [
        { key: "shop", label: "חנות", url: "https://www.vakninpro.co.il/shop/" },
      ],
    });
    const ctx = fixtureCtx("/shop/", "vaknin-listing.html");

    const cats = await adapter.listCategories(ctx);
    expect(cats.map((c) => c.key)).toContain("shop");

    const products: RawProduct[] = [];
    for await (const p of adapter.scrapeCategory(cats[0]!, ctx)) products.push(p);

    expect(products).toHaveLength(3); // page 1 only (page/2 is empty here)
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products[0]?.name).toBe("850 AG סיקה [5 ליטר] אנטי גרפיטי");
  });

  it("stops paginating when a page yields no products (avoids infinite loop)", async () => {
    const adapter = createWooAdapter({
      supplierKey: "x",
      supplierName: "x",
      baseUrl: "https://www.bniyah.co.il",
      categories: [{ key: "shop", label: "חנות", url: "https://www.bniyah.co.il/shop/" }],
    });
    const ctx = fixtureCtx("/shop/", "bniyah-listing.html");
    const products: RawProduct[] = [];
    for await (const p of adapter.scrapeCategory((await adapter.listCategories(ctx))[0]!, ctx))
      products.push(p);
    expect(products).toHaveLength(3);
  });
});

describe("instantiated store adapters", () => {
  it("vaknin/bniyah/sinai expose distinct supplier keys and base urls", () => {
    expect(vakninAdapter.supplierKey).toBe("vaknin");
    expect(bniyahAdapter.supplierKey).toBe("bniyah");
    expect(sinaiAdapter.supplierKey).toBe("sinai");
    expect(vakninAdapter.baseUrl).toBe("https://www.vakninpro.co.il");
    expect(bniyahAdapter.baseUrl).toBe("https://www.bniyah.co.il");
    expect(sinaiAdapter.baseUrl).toBe("https://www.sinaistore.com");
  });

  it("each store seeds at least one category", async () => {
    const ctx = fixtureCtx("/none", "vaknin-listing.html");
    for (const a of [vakninAdapter, bniyahAdapter, sinaiAdapter]) {
      const cats = await a.listCategories(ctx);
      expect(cats.length).toBeGreaterThanOrEqual(1);
      cats.forEach((c) => expect(c.url.startsWith("https://")).toBe(true));
    }
  });
});
