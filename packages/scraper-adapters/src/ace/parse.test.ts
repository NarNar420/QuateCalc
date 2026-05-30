import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNextPageUrl, parseProducts } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

const BASE = "https://www.ace.co.il";

describe("ace parseProducts (real Magento category fixture)", () => {
  it("extracts name, current price, sku and absolute url from rendered cards", () => {
    const products = parseProducts(fixture("category-listing.html"), {
      baseUrl: BASE,
      categoryPath: ["כלי עבודה, צבע ופרזול"],
    });
    expect(products).toHaveLength(4);

    const first = products[0];
    expect(first?.name).toBe("ACE 60-40-40 קרטון אריזה");
    expect(first?.sku).toBe("1701065");
    expect(first?.priceRaw).toBe("₪11.78");
    expect(first?.url).toBe("https://www.ace.co.il/1701065");
    expect(first?.categoryPath).toEqual(["כלי עבודה, צבע ופרזול"]);

    // every parsed product has a non-empty name, a price, and an absolute url
    expect(products.every((p) => p.name && p.priceRaw && p.url?.startsWith("https://"))).toBe(true);
  });

  it("uses the current price, not the struck-through old price", () => {
    const products = parseProducts(fixture("category-listing.html"), { baseUrl: BASE });
    // card 2 renders special ₪349 over a higher old price — current must win
    const washer = products.find((p) => p.name.includes("BOLT PRO"));
    expect(washer?.priceRaw).toBe("₪349");
  });

  it("returns an empty array for a page with no product cards", () => {
    expect(parseProducts("<html><body><p>אין מוצרים</p></body></html>", { baseUrl: BASE })).toEqual([]);
  });
});

describe("ace parseNextPageUrl", () => {
  it("returns the absolute next-page url (?p=2) when present", () => {
    expect(parseNextPageUrl(fixture("category-listing.html"), { baseUrl: BASE })).toBe(
      "https://www.ace.co.il/tools-paint-affixing?p=2",
    );
  });

  it("returns null when there is no next-page link", () => {
    expect(parseNextPageUrl("<html><body></body></html>", { baseUrl: BASE })).toBeNull();
  });
});
