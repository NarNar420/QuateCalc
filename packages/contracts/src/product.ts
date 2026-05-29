import { z } from "zod";
import { CurrencySchema, RegionSchema } from "./common.js";
import { UnitSchema } from "./units.js";

/**
 * RawProduct — what a scraper adapter yields, BEFORE normalization.
 * Strings are intentionally loose ("priceRaw", "unitRaw") because supplier
 * markup is messy; the scraper-core runner normalizes these into CatalogProduct.
 */
export const RawProductSchema = z.object({
  /** Supplier-native product name as scraped (Hebrew). */
  name: z.string().min(1),
  /** Raw price text, e.g. "₪ 24.90", "24.90 ש\"ח". */
  priceRaw: z.string().min(1),
  /** Raw unit/packaging text if present, e.g. "ל-50 ק\"ג", "מ\"ר". */
  unitRaw: z.string().optional(),
  /** Supplier SKU / catalog number if available. */
  sku: z.string().optional(),
  /** Canonical product URL on the supplier site. */
  url: z.string().url(),
  /** Category breadcrumb/path the product was found under, for diagnostics. */
  categoryPath: z.array(z.string()).optional(),
  /** Region this price applies to, if the supplier exposes regional pricing. */
  region: RegionSchema.optional(),
  /** Free-form extra fields captured for debugging adapters. */
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type RawProduct = z.infer<typeof RawProductSchema>;

/**
 * CatalogProduct — a normalized, priced catalog row. Mirrors the DB model
 * (@quatecalc/db). This is the unit the matching + pricing engines consume.
 */
export const CatalogProductSchema = z.object({
  id: z.string(),
  supplierKey: z.string(),
  sku: z.string().nullable().optional(),
  name: z.string(),
  /** Normalized name used for fuzzy/full-text matching (see @quatecalc/matching). */
  nameNormalized: z.string(),
  unit: UnitSchema,
  /** Quantity of the canonical unit contained in one purchasable unit
   *  (e.g. a "bag" of 25kg => unit=kilogram, packSize=25). Defaults to 1. */
  packSize: z.number().positive().default(1),
  /** Price per purchasable unit, in `currency`. */
  price: z.number().nonnegative(),
  currency: CurrencySchema,
  region: RegionSchema,
  url: z.string().url(),
  scrapedAt: z.coerce.date(),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
