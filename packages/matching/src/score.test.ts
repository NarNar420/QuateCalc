import { describe, expect, it } from "vitest";
import { normalizeHebrew } from "@quatecalc/units";
import { combinedScore, toCatalogProduct, tokenOverlap } from "./score.js";

describe("tokenOverlap", () => {
  it("is 1 for identical token sets", () => {
    expect(tokenOverlap("מלט אפור", "מלט אפור")).toBeCloseTo(1, 5);
  });

  it("is 0 for disjoint token sets", () => {
    expect(tokenOverlap("מלט אפור", "בלוק בטון")).toBe(0);
  });

  it("rewards a fully-contained query", () => {
    const score = tokenOverlap(
      normalizeHebrew("מלט אפור"),
      normalizeHebrew("מלט אפור CEM II 50 קג"),
    );
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });
});

describe("combinedScore", () => {
  it("scores identical strings near 1", () => {
    const q = normalizeHebrew("מלט אפור");
    expect(combinedScore(q, q, 1)).toBeCloseTo(1, 5);
  });

  it("scores unrelated strings low", () => {
    const q = normalizeHebrew("מלט אפור");
    const p = normalizeHebrew("בלוק בטון 20 סמ");
    expect(combinedScore(q, p, 0.05)).toBeLessThan(0.2);
  });

  it("scores partial overlap in between", () => {
    const q = normalizeHebrew("מלט אפור");
    const p = normalizeHebrew("מלט אפור CEM II 50 קג");
    const score = combinedScore(q, p, 0.45);
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(1);
  });

  it("clamps out-of-range trigram input", () => {
    const q = normalizeHebrew("מלט");
    expect(combinedScore(q, q, 5)).toBeLessThanOrEqual(1);
    expect(combinedScore(q, q, -3)).toBeGreaterThanOrEqual(0);
    expect(combinedScore(q, q, Number.NaN)).toBeGreaterThanOrEqual(0);
  });
});

describe("toCatalogProduct", () => {
  it("drops similarity and coerces scrapedAt to a Date", () => {
    const product = toCatalogProduct({
      id: "p1",
      supplierKey: "supA",
      sku: "SKU1",
      name: "מלט אפור",
      nameNormalized: "מלט אפור",
      unit: "bag",
      packSize: 50,
      price: 24.9,
      currency: "ILS",
      region: "center",
      url: "https://example.com/p1",
      scrapedAt: "2026-01-01T00:00:00.000Z",
      similarity: 0.8,
    });
    expect(product.scrapedAt).toBeInstanceOf(Date);
    expect(product).not.toHaveProperty("similarity");
    expect(product.unit).toBe("bag");
  });
});
