import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCategoryList, parseNextPageUrl, parseProducts } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

const BASE = "https://www.tambour.co.il";

describe("tambour parseCategoryList", () => {
  it("extracts WooCommerce category tiles, stripping the count badge", () => {
    const cats = parseCategoryList(fixture("shop.html"), { baseUrl: BASE });
    expect(cats).toHaveLength(3);
    expect(cats[0]).toEqual({
      key: "paints",
      label: "צבעים",
      url: "https://www.tambour.co.il/product-category/paints/",
    });
    expect(cats[1]?.label).toBe("טיח ושפכטל");
    expect(cats[1]?.url).toBe("https://www.tambour.co.il/product-category/finishing/");
    expect(cats[2]?.key).toBe("sealing");
  });
});

describe("tambour parseProducts", () => {
  it("extracts name, price, sku and absolute url", () => {
    const products = parseProducts(fixture("products-page1.html"), {
      baseUrl: BASE,
      categoryPath: ["צבעים"],
    });
    expect(products).toHaveLength(3);

    const supercryl = products[0];
    expect(supercryl?.name).toBe("סופרקריל לבן מט 18 ליטר");
    expect(supercryl?.priceRaw).toContain("289.00");
    expect(supercryl?.sku).toBe("SUP-W-18");
    expect(supercryl?.url).toBe("https://www.tambour.co.il/product/supercryl-white-18l/");
    expect(supercryl?.categoryPath).toEqual(["צבעים"]);
  });

  it("uses the SALE price (last .amount), not the struck-through regular price", () => {
    const products = parseProducts(fixture("products-page1.html"), { baseUrl: BASE });
    const onSale = products.find((p) => p.name.includes("אקרילי"));
    expect(onSale?.priceRaw).toContain("119.90");
    expect(onSale?.priceRaw).not.toContain("149.00");
  });

  it("skips nothing valid on page 2", () => {
    const products = parseProducts(fixture("products-page2.html"), { baseUrl: BASE });
    expect(products.map((p) => p.sku)).toEqual(["NACH-400", "MAG-27"]);
  });
});

describe("tambour parseNextPageUrl", () => {
  it("returns the next page on page 1 and null on the last page", () => {
    expect(parseNextPageUrl(fixture("products-page1.html"), { baseUrl: BASE })).toBe(
      "https://www.tambour.co.il/product-category/paints/page/2/",
    );
    expect(parseNextPageUrl(fixture("products-page2.html"), { baseUrl: BASE })).toBeNull();
  });
});
