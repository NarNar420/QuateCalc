import { z } from "zod";
import { CurrencySchema, RegionSchema } from "./common.js";
import { PricingConfigSchema, QuoteLineSchema, QuoteTotalsSchema } from "./pricing.js";

/** Everything needed to compute a quote. */
export const QuoteInputSchema = z.object({
  title: z.string().optional(),
  customerName: z.string().optional(),
  region: RegionSchema,
  lines: z.array(QuoteLineSchema.omit({ lineTotal: true })),
  pricing: PricingConfigSchema,
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

/** A fully computed quote, ready for display and export. */
export const QuoteSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  customerName: z.string().optional(),
  region: RegionSchema,
  currency: CurrencySchema,
  lines: z.array(QuoteLineSchema),
  pricing: PricingConfigSchema,
  totals: QuoteTotalsSchema,
  createdAt: z.coerce.date(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const ExportFormatSchema = z.enum(["xlsx", "csv"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
