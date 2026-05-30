import { describe, expect, it } from "vitest";
import type { StagedProductInput } from "@quatecalc/db";
import { runScrape, type RunnerDeps } from "@quatecalc/scraper-core";
import { aceAdapter } from "@quatecalc/scraper-adapters";
import { buildFixtureContext } from "./context.js";

/**
 * Hermetic end-to-end: the ACE adapter scrapes the saved fixtures through the
 * fixture context, the runner normalizes + stages, and (with in-memory fake DB
 * deps) promotes. No network, no real database.
 */
function fakeDeps(captured: { staged: StagedProductInput[]; promoted: boolean }): Partial<RunnerDeps> {
  return {
    upsertSupplier: async () => ({ id: "sup-1" }) as never,
    startScrapeRun: async () => ({ id: "run-1" }) as never,
    insertStagedProducts: async (rows) => {
      captured.staged.push(...rows);
      return rows.length;
    },
    promoteScrapeRun: async () => {
      captured.promoted = true;
      return { archived: 0, promoted: captured.staged.length };
    },
    discardStagedRun: async () => 0,
    finishScrapeRun: async () => ({}) as never,
  };
}

describe("worker refresh (fixtures, hermetic)", () => {
  it("scrapes the ACE fixtures end-to-end and promotes a healthy run", async () => {
    const captured = { staged: [] as StagedProductInput[], promoted: false };
    const result = await runScrape(aceAdapter, "center", {
      buildContext: buildFixtureContext,
      deps: fakeDeps(captured),
    });

    expect(result.status).toBe("success");
    expect(result.productCount).toBe(5);
    expect(result.nullPriceRate).toBe(0);
    expect(result.promoted).toBe(true);
    expect(captured.staged).toHaveLength(5);

    // prices parsed from "₪ 28.90" / "42.50 ש\"ח" style fixtures
    const prices = captured.staged.map((r) => r.price).sort((a, b) => a - b);
    expect(prices.every((p) => typeof p === "number" && p > 0)).toBe(true);

    // names normalized (quotes stripped, final letters folded)
    const melet = captured.staged.find((r) => r.nameNormalized.includes("מלט"));
    expect(melet).toBeDefined();
    expect(melet?.nameNormalized).not.toContain('"');
  });
});
