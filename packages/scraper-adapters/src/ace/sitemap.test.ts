import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isProductUrl, parseProductJsonLd, parseSitemapLocs } from "./sitemap.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

describe("parseSitemapLocs", () => {
  it("reads child sitemap URLs from a sitemap index", () => {
    const locs = parseSitemapLocs(fixture("sitemap-index.xml"));
    expect(locs).toHaveLength(2);
    expect(locs[0]).toMatch(/sitemap-5-1\.xml$/);
  });

  it("reads all url locs from a urlset and filters to product URLs", () => {
    const locs = parseSitemapLocs(fixture("sitemap-child.xml"));
    expect(locs).toHaveLength(5); // 1 category + 4 products
    const products = locs.filter(isProductUrl);
    expect(products).toHaveLength(4);
    expect(products.every((u) => /\/\d{5,}$/.test(u))).toBe(true);
  });
});

describe("isProductUrl", () => {
  it("accepts trailing-numeric-id URLs, rejects category slugs", () => {
    expect(isProductUrl("https://www.ace.co.il/autodepot_/batteries/103020600")).toBe(true);
    expect(isProductUrl("https://www.ace.co.il/furniture")).toBe(false);
    expect(isProductUrl("https://www.ace.co.il/furniture/tables-chairs")).toBe(false);
  });
});

describe("parseProductJsonLd", () => {
  it("extracts name, price and sku from the Product JSON-LD", () => {
    const p = parseProductJsonLd(fixture("product-jsonld.html"), "https://www.ace.co.il/1701065");
    expect(p).not.toBeNull();
    expect(p?.name).toBe("ACE 60-40-40 קרטון אריזה");
    expect(p?.priceRaw).toBe("₪11.78");
    expect(p?.sku).toBe("1701065");
    expect(p?.url).toBe("https://www.ace.co.il/1701065");
  });

  it("falls back to the trailing URL id when JSON-LD lacks a sku", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "דוגמה",
      offers: { price: "9.9" },
    })}</script>`;
    const p = parseProductJsonLd(html, "https://www.ace.co.il/cat/sub/55555");
    expect(p?.sku).toBe("55555");
    expect(p?.priceRaw).toBe("₪9.9");
  });

  it("returns null when there is no Product JSON-LD", () => {
    expect(parseProductJsonLd("<html><body>no jsonld</body></html>", "https://www.ace.co.il/1")).toBeNull();
  });

  it("keeps a zero price (price == null guard, not falsy)", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "מבצע חינם",
      sku: "777",
      offers: { price: 0 },
    })}</script>`;
    const p = parseProductJsonLd(html, "https://www.ace.co.il/777");
    expect(p).not.toBeNull();
    expect(p?.priceRaw).toBe("₪0");
  });
});
