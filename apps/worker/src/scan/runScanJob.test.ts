import type { Region, ScraperAdapter, ScraperContext } from "@quatecalc/contracts";
import { describe, expect, it, vi } from "vitest";
import { runScanJob, type ScanJobDeps } from "./runScanJob.js";

const REGION: Region = "center";

function fakeAdapter(key: string, withSearch: boolean): ScraperAdapter {
  const a: ScraperAdapter = {
    supplierKey: key,
    supplierName: key,
    baseUrl: `https://${key}.test`,
    listCategories: async () => [],
    async *scrapeCategory() {},
  };
  if (withSearch) {
    a.searchProducts = async function* () {
      yield { name: "מלט", priceRaw: "₪10", url: `https://${key}.test/p` };
    };
  }
  return a;
}

function makeDeps(overrides: Partial<ScanJobDeps> = {}): ScanJobDeps {
  return {
    getJob: vi.fn<ScanJobDeps["getJob"]>(async () => ({
      id: "j1",
      region: "center",
      lines: [{ id: "l1", rawText: "מלט", quantity: 1 }],
    })),
    adapters: [fakeAdapter("homecenter", true), fakeAdapter("ace", true)],
    upsertSupplier: vi.fn(async (s) => ({ id: "sup-" + s.key })),
    buildContext: vi.fn((): ScraperContext => ({ fetchText: async () => "", region: "center", log: () => {} })),
    runSearch: vi.fn<ScanJobDeps["runSearch"]>(async ({ adapter }) => ({
      supplierKey: adapter.supplierKey,
      region: REGION,
      query: "מלט",
      products: [{ supplierKey: adapter.supplierKey, name: "מלט", nameNormalized: "מלט", unit: "bag", packSize: 1, price: 10, currency: "ILS", region: REGION, url: "x", scrapedAt: new Date(), supplierId: "s" }],
      summary: { supplierKey: adapter.supplierKey, region: REGION, startedAt: new Date(), finishedAt: new Date(), status: "success", productCount: 1, errorCount: 0, nullPriceRate: 0, promoted: false },
    })),
    insertScannedProducts: vi.fn(async (rows) => rows.length),
    matchLines: vi.fn<ScanJobDeps["matchLines"]>(async () => [{ line: { id: "l1", rawText: "מלט", quantity: 1 }, status: "needs_review", selectedProduct: null, candidates: [], resolvedQuantity: null, resolvedUnit: null, packCount: null }]),
    updateProgress: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    ttlMs: 7200_000,
    now: () => new Date(),
    log: () => {},
    ...overrides,
  };
}

describe("runScanJob", () => {
  it("scans each search-capable supplier, inserts scanned rows, matches, completes", async () => {
    const deps = makeDeps();
    await runScanJob("j1", deps);
    expect(deps.runSearch).toHaveBeenCalledTimes(2);
    expect(deps.insertScannedProducts).toHaveBeenCalled();
    expect(deps.matchLines).toHaveBeenCalledWith(
      [{ id: "l1", rawText: "מלט", quantity: 1 }],
      expect.objectContaining({ region: "center", statuses: ["scanned"] }),
    );
    expect(deps.complete).toHaveBeenCalledWith("j1", expect.any(Array));
  });

  it("records a supplier error without failing the whole job", async () => {
    const deps = makeDeps({
      runSearch: vi.fn<ScanJobDeps["runSearch"]>(async ({ adapter }) => {
        if (adapter.supplierKey === "ace") throw new Error("anti-bot");
        return { supplierKey: "homecenter", region: REGION, query: "מלט", products: [], summary: { supplierKey: "homecenter", region: REGION, startedAt: new Date(), finishedAt: new Date(), status: "success", productCount: 0, errorCount: 0, nullPriceRate: 0, promoted: false } };
      }),
    });
    await runScanJob("j1", deps);
    expect(deps.complete).toHaveBeenCalled();
    expect(deps.fail).not.toHaveBeenCalled();
    const progressCalls = (deps.updateProgress as ReturnType<typeof vi.fn>).mock.calls;
    const sawAceError = progressCalls.some(
      ([, p]) => (p as { perSupplier: Record<string, string> }).perSupplier.ace === "error",
    );
    expect(sawAceError).toBe(true);
  });
});
