import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { tambourAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

/** Stub context serving fixtures by URL path (no network). */
function fixtureCtx(): ScraperContext {
  const map: Record<string, string> = {
    "/shop/": "shop.html",
    "/product-category/paints/": "products-page1.html",
    "/product-category/paints/page/2/": "products-page2.html",
  };
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => {
      const file = map[new URL(url).pathname];
      return file ? fixture(file) : "";
    },
  };
}

describe("tambourAdapter", () => {
  it("discovers categories from the shop page", async () => {
    const cats = await tambourAdapter.listCategories(fixtureCtx());
    expect(cats.map((c) => c.key)).toEqual(["paints", "finishing", "sealing"]);
  });

  it("scrapes a category across pagination and stamps the region", async () => {
    const ctx = fixtureCtx();
    const cats = await tambourAdapter.listCategories(ctx);
    const paints = cats.find((c) => c.key === "paints")!;

    const products: RawProduct[] = [];
    for await (const p of tambourAdapter.scrapeCategory(paints, ctx)) products.push(p);

    // 3 on page 1 + 2 on page 2
    expect(products).toHaveLength(5);
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products.map((p) => p.sku)).toContain("MAG-27");
  });
});
