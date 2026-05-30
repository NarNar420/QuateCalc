import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawProduct, ScraperContext } from "@quatecalc/contracts";
import { describe, expect, it, vi } from "vitest";
import { aceAdapter } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(here, "__fixtures__", name), "utf8");

/** Stub ctx.fetchText that serves fixtures based on the requested URL. */
function makeStubCtx(): ScraperContext {
  const fetchText = vi.fn(async (url: string) => {
    if (url.endsWith("/categories")) return fixture("categories.html");
    if (url.includes("page=2")) return fixture("products-page2.html");
    if (url.includes("/categories/")) return fixture("products-page1.html");
    return "<html></html>";
  });
  return { fetchText, region: "center", log: () => {} };
}

async function collect(it: AsyncIterable<RawProduct>): Promise<RawProduct[]> {
  const out: RawProduct[] = [];
  for await (const p of it) out.push(p);
  return out;
}

describe("aceAdapter", () => {
  it("exposes the expected identity", () => {
    expect(aceAdapter.supplierKey).toBe("ace");
    expect(aceAdapter.baseUrl).toBe("https://www.ace.co.il");
  });

  it("lists categories via ctx.fetchText", async () => {
    const ctx = makeStubCtx();
    const cats = await aceAdapter.listCategories(ctx);
    expect(cats).toHaveLength(3);
    expect(ctx.fetchText).toHaveBeenCalledWith("https://www.ace.co.il/categories");
  });

  it("scrapes a category across pagination and stamps the region", async () => {
    const ctx = makeStubCtx();
    const cats = await aceAdapter.listCategories(ctx);
    const products = await collect(aceAdapter.scrapeCategory(cats[0]!, ctx));

    // 3 products on page 1 + 2 on page 2
    expect(products).toHaveLength(5);
    expect(products.map((p) => p.name)).toContain("חול מיוצב 50 ק\"ג");
    expect(products.every((p) => p.region === "center")).toBe(true);
  });
});
