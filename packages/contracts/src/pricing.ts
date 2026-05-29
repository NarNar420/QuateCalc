import { z } from "zod";
import { CurrencySchema, DEFAULT_VAT_PERCENT } from "./common.js";
import { UnitSchema } from "./units.js";

/**
 * An overhead (additional expense) line. Either a fixed amount or a percentage
 * of the materials subtotal. Examples: transport (fixed), waste/פחת (percent),
 * labor (fixed), misc (percent).
 */
export const OverheadItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(["fixed", "percent"]),
  /** Currency amount when kind=fixed; percentage points (e.g. 10 = 10%) when kind=percent. */
  value: z.number().nonnegative(),
});
export type OverheadItem = z.infer<typeof OverheadItemSchema>;

export const OverheadConfigSchema = z.object({
  items: z.array(OverheadItemSchema).default([]),
});
export type OverheadConfig = z.infer<typeof OverheadConfigSchema>;

/** One priced line going into the quote calculation. */
export const QuoteLineInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: UnitSchema,
  /** Price per unit in the quote currency. */
  unitPrice: z.number().nonnegative(),
});
export type QuoteLineInput = z.infer<typeof QuoteLineInputSchema>;

/** A computed quote line (input + lineTotal). */
export const QuoteLineSchema = QuoteLineInputSchema.extend({
  lineTotal: z.number().nonnegative(),
});
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

/**
 * Calculation model (in order):
 *   subtotal      = Σ lineTotal
 *   overheadTotal = Σ fixed + Σ (percent% × subtotal)
 *   costBase      = subtotal + overheadTotal
 *   marginAmount  = costBase × marginPercent%
 *   beforeVat     = costBase + marginAmount
 *   vat           = beforeVat × vatPercent%
 *   grandTotal    = beforeVat + vat
 */
export const QuoteTotalsSchema = z.object({
  subtotal: z.number(),
  overheadTotal: z.number(),
  costBase: z.number(),
  marginAmount: z.number(),
  beforeVat: z.number(),
  vat: z.number(),
  grandTotal: z.number(),
});
export type QuoteTotals = z.infer<typeof QuoteTotalsSchema>;

export const PricingConfigSchema = z.object({
  overhead: OverheadConfigSchema.default({ items: [] }),
  /** Profit margin, percentage points applied to costBase. */
  marginPercent: z.number().min(0).default(0),
  /** VAT percentage; defaults to the Israeli rate. */
  vatPercent: z.number().min(0).default(DEFAULT_VAT_PERCENT),
  currency: CurrencySchema.default("ILS"),
});
export type PricingConfig = z.infer<typeof PricingConfigSchema>;
