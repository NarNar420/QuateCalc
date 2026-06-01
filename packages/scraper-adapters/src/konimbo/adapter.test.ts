import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { createKonimboAdapter, dhouseAdapter, netanelAdapter } from "./adapter.js";

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

describe("createKonimboAdapter factory", () => {
  it("yields products over a fake ctx and stamps the region", async () => {
    const adapter = createKonimboAdapter({
      supplierKey: "netanel",
      supplierName: "נתנאל לבניין",
      baseUrl: "https://www.netaneltools.co.il",
      categories: [
        {
          key: "paint",
          label: "צבע",
          url: "https://www.netaneltools.co.il/349438-paint",
        },
      ],
    });
    const ctx = fixtureCtx("/349438-paint", "netanel-listing.html");

    const cats = await adapter.listCategories(ctx);
    expect(cats.map((c) => c.key)).toContain("paint");

    const products: RawProduct[] = [];
    for await (const p of adapter.scrapeCategory(cats[0]!, ctx)) products.push(p);

    expect(products).toHaveLength(3); // page 1 only (page=2 is empty here)
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products[0]?.name).toBe("שאבי שיק צבע לבן");
    expect(products[0]?.priceRaw).toBe("89 ₪");
  });

  it("stops paginating when a page yields no products (avoids infinite loop)", async () => {
    const adapter = createKonimboAdapter({
      supplierKey: "dhouse",
      supplierName: "דוקטור האוס",
      baseUrl: "https://www.d-house.co.il",
      categories: [{ key: "x", label: "כלי עבודה", url: "https://www.d-house.co.il/349794-x" }],
    });
    const ctx = fixtureCtx("/349794-x", "dhouse-listing.html");
    const products: RawProduct[] = [];
    for await (const p of adapter.scrapeCategory((await adapter.listCategories(ctx))[0]!, ctx))
      products.push(p);
    expect(products).toHaveLength(3);
  });
});

describe("instantiated store adapters", () => {
  it("dhouse/netanel expose distinct supplier keys, names and base urls", () => {
    expect(dhouseAdapter.supplierKey).toBe("dhouse");
    expect(netanelAdapter.supplierKey).toBe("netanel");
    expect(dhouseAdapter.supplierName).toBe("דוקטור האוס");
    expect(netanelAdapter.supplierName).toBe("נתנאל לבניין");
    expect(dhouseAdapter.baseUrl).toBe("https://www.d-house.co.il");
    expect(netanelAdapter.baseUrl).toBe("https://www.netaneltools.co.il");
  });

  it("each store seeds at least one absolute-url category", async () => {
    const ctx = fixtureCtx("/none", "netanel-listing.html");
    for (const a of [dhouseAdapter, netanelAdapter]) {
      const cats = await a.listCategories(ctx);
      expect(cats.length).toBeGreaterThanOrEqual(1);
      cats.forEach((c) => expect(c.url.startsWith("https://")).toBe(true));
    }
  });
});
