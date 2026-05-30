import { describe, expect, it } from "vitest";
import type { OverheadConfig, PricingConfig, QuoteLine, QuoteLineInput } from "@quatecalc/contracts";
import { round2 } from "./round.js";
import { computeLines, computeOverhead, computeTotals } from "./calc.js";
import { computeQuote } from "./quote.js";

// ---------------------------------------------------------------------------
// round2
// ---------------------------------------------------------------------------
describe("round2", () => {
  it("leaves already-rounded values unchanged", () => {
    expect(round2(1.23)).toBe(1.23);
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
  });

  it("rounds down correctly", () => {
    expect(round2(1.234)).toBe(1.23);
  });

  it("rounds up correctly", () => {
    expect(round2(1.235)).toBe(1.24);
    expect(round2(1.005)).toBe(1.01); // floating-point trap — epsilon fix
  });

  it("handles negative values", () => {
    expect(round2(-1.235)).toBe(-1.23); // Math.round rounds towards +Infinity
  });
});

// ---------------------------------------------------------------------------
// computeLines
// ---------------------------------------------------------------------------
describe("computeLines", () => {
  it("adds lineTotal as quantity × unitPrice", () => {
    const lines: QuoteLineInput[] = [
      { description: "ריצוף", quantity: 10, unit: "square_meter", unitPrice: 85 },
    ];
    const result = computeLines(lines);
    expect(result[0].lineTotal).toBe(850);
  });

  it("rounds lineTotal to 2 decimal places", () => {
    const lines: QuoteLineInput[] = [
      { description: "צבע", quantity: 3, unit: "liter", unitPrice: 12.333 },
    ];
    const result = computeLines(lines);
    // 3 × 12.333 = 36.999 → rounds to 37.00
    expect(result[0].lineTotal).toBe(37);
  });

  it("preserves all input fields", () => {
    const line: QuoteLineInput = {
      description: "בלוקים",
      quantity: 50,
      unit: "piece",
      unitPrice: 4.5,
    };
    const [out] = computeLines([line]);
    expect(out.description).toBe("בלוקים");
    expect(out.quantity).toBe(50);
    expect(out.unit).toBe("piece");
    expect(out.unitPrice).toBe(4.5);
    expect(out.lineTotal).toBe(225);
  });

  it("handles multiple lines", () => {
    const lines: QuoteLineInput[] = [
      { description: "חול", quantity: 2, unit: "ton", unitPrice: 100 },
      { description: "צמנט", quantity: 5, unit: "bag", unitPrice: 28 },
    ];
    const result = computeLines(lines);
    expect(result[0].lineTotal).toBe(200);
    expect(result[1].lineTotal).toBe(140);
  });

  it("returns empty array for empty input", () => {
    expect(computeLines([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeOverhead
// ---------------------------------------------------------------------------
describe("computeOverhead", () => {
  it("returns 0 for empty overhead", () => {
    const overhead: OverheadConfig = { items: [] };
    expect(computeOverhead(1000, overhead)).toBe(0);
  });

  it("sums fixed items only", () => {
    const overhead: OverheadConfig = {
      items: [
        { label: "הובלה", kind: "fixed", value: 300 },
        { label: "עבודה", kind: "fixed", value: 200 },
      ],
    };
    expect(computeOverhead(5000, overhead)).toBe(500);
  });

  it("sums percent items as a fraction of subtotal", () => {
    const overhead: OverheadConfig = {
      items: [{ label: "פחת", kind: "percent", value: 10 }],
    };
    // 10% of 1000 = 100
    expect(computeOverhead(1000, overhead)).toBe(100);
  });

  it("mixes fixed and percent items", () => {
    const overhead: OverheadConfig = {
      items: [
        { label: "הובלה", kind: "fixed", value: 150 },
        { label: "פחת", kind: "percent", value: 5 },
      ],
    };
    // 150 + 5% × 2000 = 150 + 100 = 250
    expect(computeOverhead(2000, overhead)).toBe(250);
  });

  it("rounds result to 2 decimal places", () => {
    const overhead: OverheadConfig = {
      items: [{ label: "misc", kind: "percent", value: 3 }],
    };
    // 3% of 333.33 = 9.9999 → 10.00
    expect(computeOverhead(333.33, overhead)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// computeTotals
// ---------------------------------------------------------------------------

function makeLines(entries: Array<[number, number]>): QuoteLine[] {
  return entries.map(([qty, price], i) => ({
    description: `item ${i + 1}`,
    quantity: qty,
    unit: "piece" as const,
    unitPrice: price,
    lineTotal: round2(qty * price),
  }));
}

const BASE_PRICING: PricingConfig = {
  overhead: { items: [] },
  marginPercent: 0,
  vatPercent: 18,
  currency: "ILS",
};

describe("computeTotals", () => {
  it("empty lines → all zeros", () => {
    const totals = computeTotals([], BASE_PRICING);
    expect(totals.subtotal).toBe(0);
    expect(totals.overheadTotal).toBe(0);
    expect(totals.costBase).toBe(0);
    expect(totals.marginAmount).toBe(0);
    expect(totals.beforeVat).toBe(0);
    expect(totals.vat).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it("zero margin: marginAmount is 0, beforeVat equals costBase", () => {
    const lines = makeLines([[10, 100]]); // subtotal=1000
    const totals = computeTotals(lines, { ...BASE_PRICING, marginPercent: 0 });
    expect(totals.marginAmount).toBe(0);
    expect(totals.beforeVat).toBe(totals.costBase);
  });

  it("zero VAT: vat is 0, grandTotal equals beforeVat", () => {
    const lines = makeLines([[10, 100]]);
    const totals = computeTotals(lines, { ...BASE_PRICING, vatPercent: 0 });
    expect(totals.vat).toBe(0);
    expect(totals.grandTotal).toBe(totals.beforeVat);
  });

  it("default VAT is 18%", () => {
    const lines = makeLines([[1, 1000]]);
    const totals = computeTotals(lines, BASE_PRICING);
    // beforeVat=1000, vat=180, grandTotal=1180
    expect(totals.vat).toBe(180);
    expect(totals.grandTotal).toBe(1180);
  });

  it("applies margin to costBase (including overhead), not subtotal alone", () => {
    // subtotal=1000, overhead fixed=200 → costBase=1200
    // margin 10% of 1200 = 120 (NOT 10% of 1000=100)
    const lines = makeLines([[10, 100]]);
    const pricing: PricingConfig = {
      overhead: { items: [{ label: "עבודה", kind: "fixed", value: 200 }] },
      marginPercent: 10,
      vatPercent: 0,
      currency: "ILS",
    };
    const totals = computeTotals(lines, pricing);
    expect(totals.subtotal).toBe(1000);
    expect(totals.overheadTotal).toBe(200);
    expect(totals.costBase).toBe(1200);
    expect(totals.marginAmount).toBe(120); // 10% × 1200, not 10% × 1000
    expect(totals.beforeVat).toBe(1320);
    expect(totals.grandTotal).toBe(1320);
  });

  it("full model: subtotal → overhead → costBase → margin → beforeVat → vat → grandTotal", () => {
    // Two lines: 100 + 200 = subtotal 300
    // overhead: fixed 50 + 10% of 300 = 80 → overheadTotal 80
    // costBase = 300 + 80 = 380
    // margin 20% × 380 = 76 → marginAmount 76
    // beforeVat = 380 + 76 = 456
    // vat 18% × 456 = 82.08
    // grandTotal = 456 + 82.08 = 538.08
    const lines = makeLines([
      [1, 100],
      [2, 100],
    ]);
    const pricing: PricingConfig = {
      overhead: {
        items: [
          { label: "הובלה", kind: "fixed", value: 50 },
          { label: "פחת", kind: "percent", value: 10 },
        ],
      },
      marginPercent: 20,
      vatPercent: 18,
      currency: "ILS",
    };
    const totals = computeTotals(lines, pricing);
    expect(totals.subtotal).toBe(300);
    expect(totals.overheadTotal).toBe(80);
    expect(totals.costBase).toBe(380);
    expect(totals.marginAmount).toBe(76);
    expect(totals.beforeVat).toBe(456);
    expect(totals.vat).toBe(82.08);
    expect(totals.grandTotal).toBe(538.08);
  });
});

// ---------------------------------------------------------------------------
// computeQuote — end-to-end with realistic Hebrew multi-line quote
// ---------------------------------------------------------------------------
describe("computeQuote", () => {
  it("returns a fully populated Quote satisfying the contract schema", () => {
    const before = new Date();
    const quote = computeQuote({
      title: "הצעת מחיר — ריצוף מרפסת",
      customerName: "משפחת כהן",
      region: "center",
      lines: [
        { description: "אריחי ריצוף 60×60", quantity: 20, unit: "square_meter", unitPrice: 120 },
        { description: "מלט הדבקה", quantity: 4, unit: "bag", unitPrice: 45 },
        { description: "פסי נירוסטה", quantity: 6, unit: "meter", unitPrice: 18 },
      ],
      pricing: {
        overhead: {
          items: [
            { label: "הובלה", kind: "fixed", value: 250 },
            { label: "פחת חומרים", kind: "percent", value: 5 },
          ],
        },
        marginPercent: 15,
        vatPercent: 18,
        currency: "ILS",
      },
    });
    const after = new Date();

    // Metadata
    expect(quote.title).toBe("הצעת מחיר — ריצוף מרפסת");
    expect(quote.customerName).toBe("משפחת כהן");
    expect(quote.region).toBe("center");
    expect(quote.currency).toBe("ILS");

    // createdAt must be a Date within the test run
    expect(quote.createdAt).toBeInstanceOf(Date);
    expect(quote.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(quote.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());

    // Lines
    expect(quote.lines).toHaveLength(3);
    // 20 × 120 = 2400
    expect(quote.lines[0].lineTotal).toBe(2400);
    // 4 × 45 = 180
    expect(quote.lines[1].lineTotal).toBe(180);
    // 6 × 18 = 108
    expect(quote.lines[2].lineTotal).toBe(108);

    // Totals
    // subtotal = 2400 + 180 + 108 = 2688
    expect(quote.totals.subtotal).toBe(2688);
    // overheadTotal = 250 + 5% × 2688 = 250 + 134.4 = 384.4
    expect(quote.totals.overheadTotal).toBe(384.4);
    // costBase = 2688 + 384.4 = 3072.4
    expect(quote.totals.costBase).toBe(3072.4);
    // marginAmount = 15% × 3072.4 = 460.86
    expect(quote.totals.marginAmount).toBe(460.86);
    // beforeVat = 3072.4 + 460.86 = 3533.26
    expect(quote.totals.beforeVat).toBe(3533.26);
    // vat = 18% × 3533.26 = 635.99 (round2)
    expect(quote.totals.vat).toBe(635.99);
    // grandTotal = 3533.26 + 635.99 = 4169.25
    expect(quote.totals.grandTotal).toBe(4169.25);
  });

  it("empty lines → all totals zero", () => {
    const quote = computeQuote({
      region: "south",
      lines: [],
      pricing: {
        overhead: { items: [] },
        marginPercent: 10,
        vatPercent: 18,
        currency: "ILS",
      },
    });
    const { totals } = quote;
    expect(totals.subtotal).toBe(0);
    expect(totals.overheadTotal).toBe(0);
    expect(totals.costBase).toBe(0);
    expect(totals.marginAmount).toBe(0);
    expect(totals.beforeVat).toBe(0);
    expect(totals.vat).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it("zero margin and zero VAT → grandTotal equals subtotal when no overhead", () => {
    const quote = computeQuote({
      region: "jerusalem",
      lines: [{ description: "עץ", quantity: 5, unit: "meter", unitPrice: 60 }],
      pricing: {
        overhead: { items: [] },
        marginPercent: 0,
        vatPercent: 0,
        currency: "ILS",
      },
    });
    expect(quote.totals.grandTotal).toBe(300);
    expect(quote.totals.grandTotal).toBe(quote.totals.subtotal);
  });

  it("carries currency from pricing config", () => {
    const quote = computeQuote({
      region: "haifa",
      lines: [{ description: "בטון", quantity: 1, unit: "cubic_meter", unitPrice: 500 }],
      pricing: {
        overhead: { items: [] },
        marginPercent: 0,
        vatPercent: 18,
        currency: "ILS",
      },
    });
    expect(quote.currency).toBe("ILS");
  });

  it("throws ZodError on invalid input (negative unitPrice)", () => {
    expect(() =>
      computeQuote({
        region: "north",
        lines: [{ description: "שגיאה", quantity: 1, unit: "piece", unitPrice: -10 }],
        pricing: {
          overhead: { items: [] },
          marginPercent: 0,
          vatPercent: 18,
          currency: "ILS",
        },
      })
    ).toThrow();
  });

  it("margin is applied to costBase including overhead — ordering matters", () => {
    // subtotal = 500
    // overhead fixed = 500 → costBase = 1000
    // margin 10% of 1000 = 100 (would be 50 if applied only to subtotal)
    const quote = computeQuote({
      region: "center",
      lines: [{ description: "test", quantity: 5, unit: "piece", unitPrice: 100 }],
      pricing: {
        overhead: { items: [{ label: "עבודה", kind: "fixed", value: 500 }] },
        marginPercent: 10,
        vatPercent: 0,
        currency: "ILS",
      },
    });
    expect(quote.totals.subtotal).toBe(500);
    expect(quote.totals.costBase).toBe(1000);
    expect(quote.totals.marginAmount).toBe(100); // not 50
    expect(quote.totals.beforeVat).toBe(1100);
    expect(quote.totals.grandTotal).toBe(1100);
  });
});
