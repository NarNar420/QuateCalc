import { z } from "zod";

/**
 * Israeli geographic regions used for regional pricing.
 * Kept deliberately small for the MVP; extend as suppliers expose more granularity.
 */
export const RegionSchema = z.enum([
  "north", // צפון
  "haifa", // חיפה והקריות
  "center", // מרכז / שרון
  "jerusalem", // ירושלים
  "south", // דרום
]);
export type Region = z.infer<typeof RegionSchema>;

export const REGION_LABELS_HE: Record<Region, string> = {
  north: "צפון",
  haifa: "חיפה והקריות",
  center: "מרכז",
  jerusalem: "ירושלים",
  south: "דרום",
};

export const DEFAULT_REGION: Region = "center";

/** Currency. ILS only for the MVP. */
export const CurrencySchema = z.enum(["ILS"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const DEFAULT_CURRENCY: Currency = "ILS";

/** Israeli VAT (מע"מ) default, percent. 18% as of 2026; always configurable per quote. */
export const DEFAULT_VAT_PERCENT = 18;
