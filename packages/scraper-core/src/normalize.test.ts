import { describe, expect, it } from "vitest";
import { parsePrice, rawToStagedProduct } from "./normalize.js";

describe("parsePrice", () => {
  it("parses shekel-prefixed prices", () => {
    expect(parsePrice("₪ 24.90")).toBe(24.9);
    expect(parsePrice("₪28.90")).toBe(28.9);
  });

  it("parses shekel-suffixed Hebrew prices", () => {
    expect(parsePrice('24.90 ש"ח')).toBe(24.9);
    expect(parsePrice('1,234.50 ש"ח')).toBe(1234.5);
  });

  it("parses comma decimals", () => {
    expect(parsePrice("28,90")).toBe(28.9);
  });

  it("parses euro-style thousands + comma decimals", () => {
    expect(parsePrice("1.234,50")).toBe(1234.5);
  });

  it("parses comma thousands separators with no decimals", () => {
    expect(parsePrice("1,234")).toBe(1234);
    expect(parsePrice("12,345,678")).toBe(12345678);
  });

  it("parses plain integers and decimals", () => {
    expect(parsePrice("100")).toBe(100);
    expect(parsePrice("0.5")).toBe(0.5);
  });

  it("returns null for unparseable / empty input", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("   ")).toBeNull();
    expect(parsePrice("חסר במלאי")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe("rawToStagedProduct", () => {
  const baseCtx = {
    supplierId: "sup-1",
    supplierKey: "ace",
    region: "center" as const,
    scrapeRunId: "run-1",
    scrapedAt: new Date("2026-05-29T00:00:00Z"),
  };

  it("normalizes name + unit and carries price/url", () => {
    const { row, priceParsed } = rawToStagedProduct(
      {
        name: 'מלט אפור 25 ק"ג',
        priceRaw: "₪ 28.90",
        unitRaw: "שק",
        sku: "ABC-1",
        url: "https://www.ace.co.il/p/1",
      },
      baseCtx,
    );
    expect(priceParsed).toBe(28.9);
    expect(row.price).toBe(28.9);
    expect(row.unit).toBe("bag");
    expect(row.sku).toBe("ABC-1");
    expect(row.url).toBe("https://www.ace.co.il/p/1");
    expect(row.region).toBe("center");
    expect(row.packSize).toBe(1);
    expect(row.nameNormalized.length).toBeGreaterThan(0);
    expect(row.scrapeRunId).toBe("run-1");
  });

  it("falls back to piece for unknown units and 0 price for null", () => {
    const { row, priceParsed } = rawToStagedProduct(
      {
        name: "מוצר כלשהו",
        priceRaw: "לא זמין",
        url: "https://www.ace.co.il/p/2",
      },
      baseCtx,
    );
    expect(priceParsed).toBeNull();
    expect(row.unit).toBe("piece");
    expect(row.price).toBe(0);
  });
});
