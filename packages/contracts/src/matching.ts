import { z } from "zod";
import { CatalogProductSchema } from "./product.js";
import { UnitSchema } from "./units.js";

/**
 * MaterialLine — a single free-text line entered by the user.
 * e.g. { rawText: "מלט אפור", quantity: 10, rawUnit: "שק" }
 */
export const MaterialLineSchema = z.object({
  id: z.string(),
  rawText: z.string().min(1),
  quantity: z.number().positive(),
  /** Optional free-text unit as typed by the user; resolved by @quatecalc/units. */
  rawUnit: z.string().optional(),
});
export type MaterialLine = z.infer<typeof MaterialLineSchema>;

export const MatchStatusSchema = z.enum([
  "confident", // high score — auto-selected
  "needs_review", // ambiguous — user should confirm
  "no_match", // nothing found above the floor
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** A scored candidate product for a given material line. */
export const MatchCandidateSchema = z.object({
  product: CatalogProductSchema,
  /** Combined similarity score in [0,1]. */
  score: z.number().min(0).max(1),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;

/**
 * MatchedLineItem — the matching engine's output for one MaterialLine.
 * `resolved*` fields describe how the user's requested quantity maps onto the
 * selected product's purchasable units (packs).
 */
export const MatchedLineItemSchema = z.object({
  line: MaterialLineSchema,
  status: MatchStatusSchema,
  /** The chosen product (top candidate for "confident"; null for "no_match"). */
  selectedProduct: CatalogProductSchema.nullable(),
  /** Ranked alternatives shown in the review UI. */
  candidates: z.array(MatchCandidateSchema),
  /** User's quantity expressed in the product's canonical unit. */
  resolvedQuantity: z.number().positive().nullable(),
  resolvedUnit: UnitSchema.nullable(),
  /** Number of purchasable units (e.g. bags) needed, rounded up. */
  packCount: z.number().positive().nullable(),
});
export type MatchedLineItem = z.infer<typeof MatchedLineItemSchema>;

/** Confidence thresholds shared by the matching engine and UI. */
export const MATCH_THRESHOLDS = {
  /** >= confident => auto-select. */
  confident: 0.72,
  /** >= floor => offered as a review candidate; below => no_match. */
  floor: 0.4,
} as const;

/**
 * A learned correction: when a user maps a normalized raw text to a specific
 * product, we persist it (MatchOverride) and prefer it on future matches.
 */
export const MatchOverrideSchema = z.object({
  rawTextNormalized: z.string(),
  productId: z.string(),
});
export type MatchOverride = z.infer<typeof MatchOverrideSchema>;
