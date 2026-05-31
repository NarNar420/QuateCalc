import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { homecenterAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

function fixtureCtx(): ScraperContext {
  return {
    region: "center",
    log: () => {},
    fetchText: async (url: string) => (url.includes("/products.json") ? fixture("products.json") : ""),
  };
}

describe("homecenterAdapter", () => {
  it("exposes the products feed as a single category", async () => {
    const cats = await homecenterAdapter.listCategories(fixtureCtx());
    expect(cats).toHaveLength(1);
    expect(cats[0]?.key).toBe("all");
    expect(homecenterAdapter.supplierKey).toBe("homecenter");
  });

  it("scrapes the Shopify feed and stamps the region", async () => {
    const ctx = fixtureCtx();
    const [cat] = await homecenterAdapter.listCategories(ctx);
    const products: RawProduct[] = [];
    for await (const p of homecenterAdapter.scrapeCategory(cat, ctx)) products.push(p);

    expect(products).toHaveLength(3);
    expect(products.every((p) => p.region === "center")).toBe(true);
    expect(products.map((p) => p.sku)).toContain("1777878798868");
  });
});
