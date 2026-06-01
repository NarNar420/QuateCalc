import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { homreybinyanAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

function fixtureCtx(): ScraperContext {
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => (url.includes("/products.json") ? fixture("products.json") : ""),
  };
}

describe("homreybinyanAdapter", () => {
  it("exposes the products feed as a single category", async () => {
    const cats = await homreybinyanAdapter.listCategories(fixtureCtx());
    expect(cats).toHaveLength(1);
    expect(cats[0]?.key).toBe("all");
    expect(homreybinyanAdapter.supplierKey).toBe("homreybinyan");
    expect(homreybinyanAdapter.supplierName).toBe("הראל ועידן הכל לבניין");
  });

  it("scrapes the Shopify feed and stamps the region", async () => {
    const ctx = fixtureCtx();
    const [cat] = await homreybinyanAdapter.listCategories(ctx);
    const products: RawProduct[] = [];
    for await (const p of homreybinyanAdapter.scrapeCategory(cat, ctx)) products.push(p);

    expect(products).toHaveLength(4);
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products.every((p) => p.priceRaw.startsWith("₪"))).toBe(true);

    const signet = products.find((p) => p.name === "סט מברגים 7 יחידות SIGNET");
    expect(signet).toBeDefined();
    expect(signet?.priceRaw).toBe("₪75.00");
    // This store leaves sku empty, so the parser falls back to the handle.
    expect(signet?.sku).toBe("סט-מברגים-כחול-צהוב-7-יח-signet");
    expect(signet?.url).toBe(
      "https://homreybinyan.co.il/products/סט-מברגים-כחול-צהוב-7-יח-signet",
    );
  });
});
