import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseKonimboNextPage, parseKonimboProducts } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(join(here, "__fixtures__", name), "utf8");

describe("parseKonimboProducts — Netanel (h3.title, span.price)", () => {
  const BASE = "https://www.netaneltools.co.il";

  it("extracts name, current price and absolute /items/ url from each card", () => {
    const products = parseKonimboProducts(fixture("netanel-listing.html"), {
      baseUrl: BASE,
      categoryPath: ["צבע"],
    });
    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first?.name).toBe("שאבי שיק צבע לבן");
    expect(first?.priceRaw).toBe("89 ₪");
    expect(first?.url).toBe(
      "https://www.netaneltools.co.il/items/5944832-%D7%A9%D7%90%D7%91%D7%99-%D7%A9%D7%99%D7%A7-%D7%A6%D7%91%D7%A2-%D7%9C%D7%91%D7%9F-",
    );
    expect(first?.categoryPath).toEqual(["צבע"]);

    expect(products.map((p) => p.priceRaw)).toEqual(["89 ₪", "89 ₪", "29 ₪"]);
    expect(products.every((p) => p.name && p.priceRaw && p.url?.startsWith("https://"))).toBe(true);
    expect(products.every((p) => p.url?.includes("/items/"))).toBe(true);
  });

  it("returns the absolute next-page url from <link rel=next>", () => {
    expect(parseKonimboNextPage(fixture("netanel-listing.html"), { baseUrl: BASE })).toBe(
      "https://www.netaneltools.co.il/349438-%D7%A6%D7%91%D7%A2?page=2",
    );
  });
});

describe("parseKonimboProducts — D-House (p.title, p.price)", () => {
  const BASE = "https://www.d-house.co.il";

  it("reads the name and price, stripping the hidden 'מחיר' label", () => {
    const products = parseKonimboProducts(fixture("dhouse-listing.html"), {
      baseUrl: BASE,
      categoryPath: ["כלי עבודה"],
    });
    expect(products).toHaveLength(3);

    const first = products[0];
    expect(first?.name).toBe("שפכטל נירוסטה גמיש 2 צול");
    expect(first?.priceRaw).toBe("16 ₪"); // the hidden "מחיר" label must NOT leak in
    expect(first?.url?.includes("/items/")).toBe(true);
    expect(first?.url?.startsWith("https://www.d-house.co.il/items/")).toBe(true);

    expect(products.map((p) => p.priceRaw)).toEqual(["16 ₪", "19 ₪", "20 ₪"]);
  });

  it("returns the absolute next-page url", () => {
    expect(parseKonimboNextPage(fixture("dhouse-listing.html"), { baseUrl: BASE })).toBe(
      "https://www.d-house.co.il/349794-%D7%9B%D7%9C%D7%99-%D7%A2%D7%91%D7%95%D7%93%D7%94?page=2",
    );
  });
});

describe("parseKonimboProducts — robustness", () => {
  it("returns an empty array for a page with no product cards", () => {
    expect(
      parseKonimboProducts("<html><body><p>אין מוצרים</p></body></html>", {
        baseUrl: "https://example.com",
      }),
    ).toEqual([]);
  });

  it("returns null next-page when there is no pagination link", () => {
    expect(
      parseKonimboNextPage("<html><body></body></html>", { baseUrl: "https://example.com" }),
    ).toBeNull();
  });

  it("skips a card missing a price or url", () => {
    const html = `<div class="layout_list_item item">
      <a href="/items/1-foo"><h3 class="title">בלי מחיר</h3></a>
    </div>`;
    expect(parseKonimboProducts(html, { baseUrl: "https://example.com" })).toEqual([]);
  });
});
