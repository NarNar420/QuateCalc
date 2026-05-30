import { describe, expect, it } from "vitest";
import type { CatalogProduct, MaterialLine } from "@quatecalc/contracts";
import { resolveQuantity } from "./resolve.js";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    supplierKey: "supA",
    sku: null,
    name: "מלט אפור",
    nameNormalized: "מלט אפור",
    unit: "kilogram",
    packSize: 25,
    price: 30,
    currency: "ILS",
    region: "center",
    url: "https://example.com/p1",
    scrapedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function line(overrides: Partial<MaterialLine> = {}): MaterialLine {
  return { id: "1", rawText: "מלט", quantity: 1, ...overrides };
}

describe("resolveQuantity", () => {
  it("computes packCount for kg/packSize 25", () => {
    const r = resolveQuantity(line({ quantity: 110, rawUnit: 'ק"ג' }), product());
    expect(r.resolvedUnit).toBe("kilogram");
    expect(r.resolvedQuantity).toBe(110);
    expect(r.packCount).toBe(5); // ceil(110 / 25)
  });

  it("converts ton -> kilogram before computing packs", () => {
    const r = resolveQuantity(line({ quantity: 2, rawUnit: "טון" }), product());
    expect(r.resolvedQuantity).toBe(2000);
    expect(r.packCount).toBe(80); // ceil(2000 / 25)
  });

  it("treats a missing unit as already in the product unit", () => {
    const r = resolveQuantity(line({ quantity: 50 }), product());
    expect(r.resolvedQuantity).toBe(50);
    expect(r.packCount).toBe(2); // ceil(50 / 25)
  });

  it("treats an incompatible unit as already in the product unit", () => {
    const r = resolveQuantity(line({ quantity: 7, rawUnit: 'מ"ר' }), product());
    expect(r.resolvedQuantity).toBe(7);
    expect(r.packCount).toBe(1); // ceil(7 / 25)
  });

  it("defaults packSize <= 0 to 1", () => {
    const r = resolveQuantity(line({ quantity: 3 }), product({ packSize: 1 }));
    expect(r.packCount).toBe(3);
  });
});
