import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isLeafCategoryUrl, parseSitemapLocs } from "./sitemap.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

describe("parseSitemapLocs", () => {
  it("reads child sitemap URLs from a sitemap index", () => {
    const locs = parseSitemapLocs(fixture("sitemap-index.xml"));
    expect(locs).toHaveLength(2);
    expect(locs[0]).toMatch(/sitemap-5-1\.xml$/);
  });

  it("reads all url locs from a urlset and filters to leaf-category URLs", () => {
    const locs = parseSitemapLocs(fixture("sitemap-child.xml"));
    expect(locs).toHaveLength(5); // 1 category + 4 products
    const leafCategories = locs.filter(isLeafCategoryUrl);
    expect(leafCategories).toHaveLength(4);
    expect(leafCategories.every((u) => /\/\d{5,}$/.test(u))).toBe(true);
  });
});

describe("isLeafCategoryUrl", () => {
  it("accepts trailing-numeric-id URLs, rejects category slugs", () => {
    expect(isLeafCategoryUrl("https://www.ace.co.il/autodepot_/batteries/103020600")).toBe(true);
    expect(isLeafCategoryUrl("https://www.ace.co.il/furniture")).toBe(false);
    expect(isLeafCategoryUrl("https://www.ace.co.il/furniture/tables-chairs")).toBe(false);
  });
});
