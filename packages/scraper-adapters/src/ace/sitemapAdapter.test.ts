import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { createAceSitemapAdapter } from "./sitemapAdapter.js";
import { isLeafCategoryUrl } from "./sitemap.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

/** index -> index fixture; child sitemaps -> child fixture; leaf categories -> real listing. */
function fixtureCtx(): ScraperContext {
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return fixture("sitemap-index.xml");
      if (/sitemap-5-\d+\.xml$/.test(url)) return fixture("sitemap-child.xml");
      if (isLeafCategoryUrl(url)) return fixture("category-listing.html");
      return "";
    },
  };
}

describe("createAceSitemapAdapter", () => {
  it("seeds a single synthetic sitemap category", async () => {
    const adapter = createAceSitemapAdapter();
    const cats = await adapter.listCategories(fixtureCtx());
    expect(cats).toHaveLength(1);
    expect(cats[0]?.key).toBe("sitemap");
    expect(adapter.supplierKey).toBe("ace");
  });

  it("discovers leaf categories from the sitemap and yields listing products, capped", async () => {
    const adapter = createAceSitemapAdapter({ maxProducts: 2 });
    const ctx = fixtureCtx();
    const [cat] = await adapter.listCategories(ctx);

    const products: RawProduct[] = [];
    for await (const p of adapter.scrapeCategory(cat, ctx)) products.push(p);

    expect(products).toHaveLength(2); // cap respected (listing fixture has 4)
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products.every((p) => p.priceRaw.startsWith("₪"))).toBe(true);
  });
});
