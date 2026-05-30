import { describe, expect, it } from "vitest";
import type { StagedProductInput } from "@quatecalc/db";
import { runScrape, type RunnerDeps } from "@quatecalc/scraper-core";
import { aceAdapter, tambourAdapter } from "@quatecalc/scraper-adapters";
import { fixtureContextBuilder } from "./context.js";

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
      buildContext: fixtureContextBuilder("ace"),
      deps: fakeDeps(captured),
    });

    expect(result.status).toBe("success");
    expect(result.productCount).toBe(4);
    expect(result.nullPriceRate).toBe(0);
    expect(result.promoted).toBe(true);
    expect(captured.staged).toHaveLength(4);

    // prices parsed from "₪11.78" / "₪349" rendered Magento markup
    const prices = captured.staged.map((r) => r.price);
    expect(prices.every((p) => typeof p === "number" && p > 0)).toBe(true);

    // a real scraped SKU is present and names are normalized (quotes stripped)
    const carton = captured.staged.find((r) => r.sku === "1701065");
    expect(carton).toBeDefined();
    expect(carton?.nameNormalized).not.toContain('"');
  });

  it("scrapes the Tambour (WooCommerce) fixtures end-to-end, using sale prices", async () => {
    const captured = { staged: [] as StagedProductInput[], promoted: false };
    const result = await runScrape(tambourAdapter, "center", {
      buildContext: fixtureContextBuilder("tambour"),
      deps: fakeDeps(captured),
    });

    expect(result.status).toBe("success");
    expect(result.productCount).toBe(5); // 3 (page 1) + 2 (page 2)
    expect(result.nullPriceRate).toBe(0);
    expect(result.promoted).toBe(true);

    // the on-sale acrylic paint must be staged at its sale price (119.9), not 149
    const acrylic = captured.staged.find((r) => r.name.includes("אקרילי"));
    expect(acrylic?.price).toBe(119.9);
  });
});
