import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { aceAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

/** Stub context serving the category fixture for the seeded category URL. */
function fixtureCtx(): ScraperContext {
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => {
      const path = new URL(url).pathname;
      // page 1 = the seeded category; any ?p=2 page is unavailable (returns empty)
      if (path === "/tools-paint-affixing" && !new URL(url).search) {
        return fixture("category-listing.html");
      }
      return "";
    },
  };
}

describe("aceAdapter", () => {
  it("seeds the known department category", async () => {
    const cats = await aceAdapter.listCategories(fixtureCtx());
    expect(cats.map((c) => c.key)).toContain("tools-paint-affixing");
  });

  it("scrapes the category page and stamps the region", async () => {
    const ctx = fixtureCtx();
    const cats = await aceAdapter.listCategories(ctx);
    const dept = cats.find((c) => c.key === "tools-paint-affixing")!;

    const products: RawProduct[] = [];
    for await (const p of aceAdapter.scrapeCategory(dept, ctx)) products.push(p);

    expect(products).toHaveLength(4); // page 1 only (?p=2 is unavailable here)
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products.map((p) => p.sku)).toContain("1701065");
  });
});

/** Stub context that serves the given html for every fetch and records URLs. */
function ctxReturning(html: string): ScraperContext & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    region: "center",
    log: () => {},
    fetchText: async (u: string) => {
      urls.push(u);
      return html;
    },
  };
}

describe("aceAdapter.searchProducts", () => {
  it("queries catalogsearch and yields parsed products from the first page", async () => {
    const ctx = ctxReturning(fixture("category-listing.html"));
    const out: RawProduct[] = [];
    for await (const p of aceAdapter.searchProducts!("מלט", ctx)) out.push(p);
    expect(out.length).toBeGreaterThan(0);
    expect(ctx.urls[0]).toContain("catalogsearch/result/?q=");
    expect(ctx.urls[0]).toContain(encodeURIComponent("מלט"));
    expect(out[0]!.region).toBe("center");
  });
});
