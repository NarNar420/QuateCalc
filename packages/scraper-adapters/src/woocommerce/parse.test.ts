import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWooNextPage, parseWooProducts } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

describe("parseWooProducts — Vaknin (custom theme, li.title / li.inner .price)", () => {
  const BASE = "https://www.vakninpro.co.il";

  it("extracts name, current price and absolute /product/ url from each card", () => {
    const products = parseWooProducts(fixture("vaknin-listing.html"), {
      baseUrl: BASE,
      categoryPath: ["וקנין פרו — חנות"],
    });
    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first?.name).toBe("850 AG סיקה [5 ליטר] אנטי גרפיטי");
    expect(first?.priceRaw).toBe("₪1,169.00");
    expect(first?.url?.startsWith("https://www.vakninpro.co.il/product/")).toBe(true);
    expect(first?.categoryPath).toEqual(["וקנין פרו — חנות"]);

    expect(products.map((p) => p.priceRaw)).toEqual(["₪1,169.00", "₪500.00", "₪195.00"]);
    expect(products.every((p) => p.name && p.priceRaw && p.url?.startsWith("https://"))).toBe(true);
  });

  it("returns the absolute next-page url", () => {
    expect(parseWooNextPage(fixture("vaknin-listing.html"), { baseUrl: BASE })).toBe(
      "https://www.vakninpro.co.il/shop/page/2/",
    );
  });
});

describe("parseWooProducts — Bniyah (WoodMart, h3.wd-entities-title)", () => {
  const BASE = "https://www.bniyah.co.il";

  it("reads the price amount only, ignoring the VAT disclaimer in the .price block", () => {
    const products = parseWooProducts(fixture("bniyah-listing.html"), { baseUrl: BASE });
    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first?.name).toBe("XT501 איטום על בסיס פוליאוריטני");
    // the .price span also contains an <h6 class="demo"> disclaimer — must NOT leak in
    expect(first?.priceRaw).toBe("₪432.00");
    expect(first?.url?.includes("/product/")).toBe(true);

    expect(products.map((p) => p.priceRaw)).toEqual(["₪432.00", "₪7.00", "₪35.00"]);
  });

  it("returns the absolute next-page url", () => {
    expect(parseWooNextPage(fixture("bniyah-listing.html"), { baseUrl: BASE })).toBe(
      "https://bniyah.co.il/shop/page/2/",
    );
  });
});

describe("parseWooProducts — Sinai (Impreza/USES, sale <del>/<ins>, subcategory tiles)", () => {
  const BASE = "https://www.sinaistore.com";

  it("uses the <ins> sale price, not the struck-through <del> old price", () => {
    const products = parseWooProducts(fixture("sinai-listing.html"), { baseUrl: BASE });

    const charger = products.find((p) => p.name.includes("DC18RC"));
    expect(charger).toBeDefined();
    expect(charger?.priceRaw).toBe("₪254.32"); // sale (ins), NOT ₪289.00 (del)
  });

  it("skips subcategory tiles (title links to /product-category/) and keeps only products", () => {
    const products = parseWooProducts(fixture("sinai-listing.html"), { baseUrl: BASE });
    expect(products).toHaveLength(3); // 1 sale + 2 regular; the subcategory tile is skipped
    expect(products.every((p) => p.url?.includes("/product/"))).toBe(true);
    expect(products.every((p) => !p.url?.includes("/product-category/"))).toBe(true);
    expect(products.map((p) => p.priceRaw)).toEqual(["₪254.32", "₪449.00", "₪12.00"]);
  });

  it("returns the absolute next-page url", () => {
    expect(parseWooNextPage(fixture("sinai-listing.html"), { baseUrl: BASE })).toBe(
      "https://www.sinaistore.com/product-category/%d7%9b%d7%9c%d7%99-%d7%a2%d7%91%d7%95%d7%93%d7%94-%d7%97%d7%a9%d7%9e%d7%9c%d7%99%d7%99%d7%9d/page/2/",
    );
  });
});

describe("parseWooProducts — robustness", () => {
  it("returns an empty array for a page with no product cards", () => {
    expect(
      parseWooProducts("<html><body><p>אין מוצרים</p></body></html>", {
        baseUrl: "https://example.com",
      }),
    ).toEqual([]);
  });

  it("returns null next-page when there is no pagination link", () => {
    expect(
      parseWooNextPage("<html><body></body></html>", { baseUrl: "https://example.com" }),
    ).toBeNull();
  });
});
