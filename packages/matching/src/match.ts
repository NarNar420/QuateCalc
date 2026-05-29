import {
  type MatchCandidate,
  type MatchedLineItem,
  MatchedLineItemSchema,
  type MatchStatus,
  type MaterialLine,
  MATCH_THRESHOLDS,
  type Region,
} from "@quatecalc/contracts";
import {
  getOverrides,
  getProductsByIds,
  searchCatalogByTrigram,
} from "@quatecalc/db";
import { normalizeHebrew } from "@quatecalc/units";
import { resolveQuantity } from "./resolve.js";
import { combinedScore, toCatalogProduct } from "./score.js";

export interface MatchOptions {
  region: Region;
  /** Score at/above which the top candidate is auto-selected. */
  confidentThreshold?: number;
  /** Score at/above which a candidate is offered for review; below => no_match. */
  floor?: number;
  /** Max trigram candidates to fetch per line. */
  limit?: number;
}

/**
 * Map free-text material lines to catalog products.
 *
 * For each line: normalize the text, prefer a learned override (one batched
 * lookup for all lines), otherwise run a region-scoped trigram search, blend
 * the scores, rank candidates, and apply the confidence thresholds. The
 * selected product's quantity is resolved into purchasable packs.
 */
export async function matchLines(
  lines: MaterialLine[],
  opts: MatchOptions,
): Promise<MatchedLineItem[]> {
  const confident = opts.confidentThreshold ?? MATCH_THRESHOLDS.confident;
  const floor = opts.floor ?? MATCH_THRESHOLDS.floor;
  const limit = opts.limit ?? 10;

  if (lines.length === 0) return [];

  // Normalize once per line; reuse for overrides + search.
  const normalized = lines.map((line) => normalizeHebrew(line.rawText));

  // Batch override lookup, then resolve the override products in one fetch.
  const overrideMap = await getOverrides(normalized.filter((n) => n.length > 0));
  const overrideIds = [...new Set([...overrideMap.values()])];
  const overrideProducts = overrideIds.length > 0 ? await getProductsByIds(overrideIds) : [];
  const overrideProductById = new Map(overrideProducts.map((p) => [p.id, p]));

  const results: MatchedLineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const queryNorm = normalized[i]!;

    // 1) Override wins as a confident match when the product still exists.
    const overrideId = overrideMap.get(queryNorm);
    if (overrideId) {
      const row = overrideProductById.get(overrideId);
      if (row) {
        const product = toCatalogProduct(row);
        const resolved = resolveQuantity(line, product);
        results.push(
          MatchedLineItemSchema.parse({
            line,
            status: "confident" satisfies MatchStatus,
            selectedProduct: product,
            candidates: [{ product, score: 1 }],
            resolvedQuantity: resolved.resolvedQuantity,
            resolvedUnit: resolved.resolvedUnit,
            packCount: resolved.packCount,
          }),
        );
        continue;
      }
    }

    // 2) Trigram search + combined scoring.
    let candidates: MatchCandidate[] = [];
    if (queryNorm.length > 0) {
      const rows = await searchCatalogByTrigram({
        normalizedQuery: queryNorm,
        region: opts.region,
        limit,
      });
      candidates = rows
        .map((row) => ({
          product: toCatalogProduct(row),
          score: combinedScore(queryNorm, row.nameNormalized, row.similarity),
        }))
        .sort((a, b) => b.score - a.score);
    }

    const top = candidates[0];
    let status: MatchStatus;
    let selectedProduct: MatchedLineItem["selectedProduct"];

    if (top && top.score >= confident) {
      status = "confident";
      selectedProduct = top.product;
    } else if (top && top.score >= floor) {
      status = "needs_review";
      selectedProduct = top.product;
    } else {
      status = "no_match";
      selectedProduct = null;
    }

    let resolvedQuantity: number | null = null;
    let resolvedUnit: MatchedLineItem["resolvedUnit"] = null;
    let packCount: number | null = null;
    if (selectedProduct) {
      const resolved = resolveQuantity(line, selectedProduct);
      resolvedQuantity = resolved.resolvedQuantity;
      resolvedUnit = resolved.resolvedUnit;
      packCount = resolved.packCount;
    }

    // Only surface candidates at/above the floor in the review UI.
    const offered = status === "no_match" ? [] : candidates.filter((c) => c.score >= floor);

    results.push(
      MatchedLineItemSchema.parse({
        line,
        status,
        selectedProduct,
        candidates: offered,
        resolvedQuantity,
        resolvedUnit,
        packCount,
      }),
    );
  }

  return results;
}
