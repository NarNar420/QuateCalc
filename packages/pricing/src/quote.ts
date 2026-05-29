import {
  QuoteInputSchema,
  QuoteSchema,
  type Quote,
  type QuoteInput,
} from "@quatecalc/contracts";
import { computeLines, computeTotals } from "./calc.js";

/**
 * Top-level function: validates input, computes lines + totals, and returns a
 * fully contract-validated Quote.
 *
 * Throws a ZodError if either the input or the computed output fails validation.
 */
export function computeQuote(input: QuoteInput): Quote {
  // Validate input — throws ZodError on failure
  const parsed = QuoteInputSchema.parse(input);

  const lines = computeLines(parsed.lines);
  const totals = computeTotals(lines, parsed.pricing);

  const quote: Quote = {
    title: parsed.title,
    customerName: parsed.customerName,
    region: parsed.region,
    currency: parsed.pricing.currency,
    lines,
    pricing: parsed.pricing,
    totals,
    createdAt: new Date(),
  };

  // Validate output against contract — guarantees callers receive a correct Quote
  return QuoteSchema.parse(quote);
}
