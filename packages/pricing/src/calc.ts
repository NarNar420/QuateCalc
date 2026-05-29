import type {
  OverheadConfig,
  PricingConfig,
  QuoteLine,
  QuoteLineInput,
  QuoteTotals,
} from "@quatecalc/contracts";
import { round2 } from "./round.js";

/**
 * Adds `lineTotal` to each input line.
 * lineTotal = quantity × unitPrice, rounded to 2 decimal places.
 */
export function computeLines(lines: QuoteLineInput[]): QuoteLine[] {
  return lines.map((line) => ({
    ...line,
    lineTotal: round2(line.quantity * line.unitPrice),
  }));
}

/**
 * Computes the total overhead for a given subtotal.
 *
 * overheadTotal = Σ fixed + Σ (percent% × subtotal)
 *
 * The result is rounded to 2 decimal places.
 */
export function computeOverhead(subtotal: number, overhead: OverheadConfig): number {
  let total = 0;
  for (const item of overhead.items) {
    if (item.kind === "fixed") {
      total += item.value;
    } else {
      // kind === "percent": value is in percentage points (e.g. 10 = 10%)
      total += (item.value / 100) * subtotal;
    }
  }
  return round2(total);
}

/**
 * Full calculation model (in order):
 *   subtotal      = Σ lineTotal
 *   overheadTotal = Σ fixed + Σ (percent% × subtotal)
 *   costBase      = subtotal + overheadTotal
 *   marginAmount  = costBase × marginPercent%
 *   beforeVat     = costBase + marginAmount
 *   vat           = beforeVat × vatPercent%
 *   grandTotal    = beforeVat + vat
 *
 * All monetary values are rounded to 2 decimal places.
 */
export function computeTotals(lines: QuoteLine[], pricing: PricingConfig): QuoteTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  const overheadTotal = computeOverhead(subtotal, pricing.overhead);

  const costBase = round2(subtotal + overheadTotal);

  const marginAmount = round2((pricing.marginPercent / 100) * costBase);

  const beforeVat = round2(costBase + marginAmount);

  const vat = round2((pricing.vatPercent / 100) * beforeVat);

  const grandTotal = round2(beforeVat + vat);

  return {
    subtotal,
    overheadTotal,
    costBase,
    marginAmount,
    beforeVat,
    vat,
    grandTotal,
  };
}
