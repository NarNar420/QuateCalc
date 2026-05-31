import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseShopifyProducts } from "./shopify.js";

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
