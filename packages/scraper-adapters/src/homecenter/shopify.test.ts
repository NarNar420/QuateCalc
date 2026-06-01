import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseShopifyProducts, parseShopifySearch } from "./shopify.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");
const BASE = "https://www.homecenter.co.il";

describe("parseShopifyProducts", () => {
  it("extracts name, price (₪-prefixed), sku, url and category from products.json", () => {
    const products = parseShopifyProducts(fixture("products.json"), { baseUrl: BASE });
    expect(products).toHaveLength(3);
    const first = products[0];
    expect(first?.name).toContain("סרט אלומיניום");
    expect(first?.priceRaw).toBe("₪79.90");
    expect(first?.sku).toBe("1777878798868");
    expect(first?.url).toBe("https://www.homecenter.co.il/products/1777878798868");
    expect(first?.categoryPath).toEqual(["סרטי איטום"]);
    expect(products.every((p) => p.priceRaw.startsWith("₪") && p.url.startsWith("https://"))).toBe(true);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseShopifyProducts("not json", { baseUrl: BASE })).toEqual([]);
  });

  it("skips products missing a price or handle", () => {
    const json = JSON.stringify({
      products: [
        { title: "no price", handle: "h1", variants: [{ sku: "s1" }] },
        { title: "ok", handle: "h2", variants: [{ sku: "s2", price: "10.00" }] },
      ],
    });
    const out = parseShopifyProducts(json, { baseUrl: BASE });
    expect(out).toHaveLength(1);
    expect(out[0]?.sku).toBe("s2");
  });
});

const searchFixture = readFileSync(
  fileURLToPath(new URL("./__fixtures__/search-suggest.json", import.meta.url)),
  "utf8",
);

describe("parseShopifySearch", () => {
  const BASE = "https://www.homecenter.co.il";

  it("filters the products.json feed by query, keeping priced matches only", () => {
    // Query "צבע" (paint) matches 2 priced products; the price-less paint is
    // dropped by parseShopifyProducts and the brush ("מברשת") doesn't match.
    const out = parseShopifySearch(searchFixture, { baseUrl: BASE }, "צבע");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: "צבע אקרילי לבן 5 ליטר",
      priceRaw: "₪19.90",
      url: "https://www.homecenter.co.il/products/tzeva-akrili-lavan-5l",
      sku: "tzeva-akrili-lavan-5l",
    });
    expect(out[1]?.priceRaw).toBe("₪24.50");
    expect(out.every((p) => p.name.includes("צבע"))).toBe(true);
  });

  it("requires every query token to appear in the name", () => {
    const out = parseShopifySearch(searchFixture, { baseUrl: BASE }, "צבע אפור");
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("צבע יסוד אפור 1 ליטר");
  });

  it("returns [] on malformed JSON", () => {
    expect(parseShopifySearch("not json", { baseUrl: "https://x.test" }, "צבע")).toEqual([]);
  });
});
