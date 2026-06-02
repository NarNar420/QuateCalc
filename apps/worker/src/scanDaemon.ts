/**
 * On-demand scan daemon.
 *
 * Polls the `ScanJob` Postgres queue (the table IS the queue — no Redis),
 * atomically claims the oldest pending job, and runs it: search every
 * search-capable supplier for each line term, persist ephemeral `scanned`
 * rows, match the lines against them, and write the result. The web app
 * enqueues jobs (POST /api/scan) and polls them (GET /api/scan/:id).
 *
 * Run with: pnpm --filter @quatecalc/worker scan-daemon
 * Requires the Playwright browser for ACE: `pnpm --filter @quatecalc/scraper-browser install-browser`.
 * Set SCAN_BROWSER=false to scan HTTP-only suppliers without launching Chromium.
 */
import {
  claimNextScanJob,
  completeScanJob,
  failScanJob,
  getScanJob,
  insertScannedProducts,
  pruneExpiredScanned,
  sweepStaleScanJobs,
  updateScanJobProgress,
  upsertSupplier,
} from "@quatecalc/db";
import { matchLines } from "@quatecalc/matching";
import { registerAllAdapters } from "@quatecalc/scraper-adapters";
import { getAdapter, runSearch } from "@quatecalc/scraper-core";
import { liveContextBuilder } from "./context.js";
import { runScanJob, type ScanJobRecord } from "./scan/runScanJob.js";

const POLL_MS = 1000;
const TTL_MS = 2 * 60 * 60 * 1000; // scanned rows live 2h
const STALE_MS = 5 * 60 * 1000; // jobs stuck >5m are swept to failed
const USE_BROWSER = process.env.SCAN_BROWSER !== "false";

/** Supplier keys that implement `searchProducts` on this branch. */
const SEARCH_SUPPLIERS = ["homecenter", "ace"];

async function main(): Promise<void> {
  registerAllAdapters();
  const adapters = SEARCH_SUPPLIERS.map((k) => getAdapter(k)).filter(
    (a): a is NonNullable<typeof a> => Boolean(a),
  );

  // Build the fetch context. ACE search is Knockout-rendered → needs a browser;
  // HTTP suppliers work through it too. Fall back to plain HTTP if SCAN_BROWSER=false.
  let buildContext = liveContextBuilder();
  let closeTransport: (() => Promise<void>) | undefined;
  if (USE_BROWSER) {
    try {
      const { createBrowserTransport } = await import("@quatecalc/scraper-browser");
      const bt = createBrowserTransport({});
      closeTransport = bt.close;
      buildContext = liveContextBuilder({ transport: bt.fetchText });
    } catch (err) {
      console.warn(`[scan-daemon] browser transport unavailable, HTTP-only: ${String(err)}`);
    }
  }

  let running = true;
  const stop = async () => {
    running = false;
    await closeTransport?.();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(
    `[scan-daemon] polling for scan jobs (browser=${USE_BROWSER}, suppliers=${adapters.map((a) => a.supplierKey).join(",")})`,
  );

  while (running) {
    await sweepStaleScanJobs(STALE_MS).catch(() => 0);
    await pruneExpiredScanned().catch(() => 0);

    const claimed = await claimNextScanJob().catch((err) => {
      console.error(`[scan-daemon] claim failed: ${String(err)}`);
      return null;
    });
    if (!claimed) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    console.log(`[scan-daemon] job ${claimed.id} claimed (region=${claimed.region})`);
    await runScanJob(claimed.id, {
      getJob: async (id) => {
        const j = await getScanJob(id);
        return j
          ? ({ id: j.id, region: j.region, lines: j.lines as ScanJobRecord["lines"] })
          : null;
      },
      adapters,
      upsertSupplier,
      buildContext: (region) => buildContext(region),
      runSearch,
      insertScannedProducts,
      matchLines,
      updateProgress: updateScanJobProgress,
      complete: completeScanJob,
      fail: failScanJob,
      ttlMs: TTL_MS,
      now: () => new Date(),
      log: (lvl, msg) =>
        lvl === "error" ? console.error(`[scan-daemon] ${msg}`) : console.log(`[scan-daemon] ${msg}`),
    }).catch((err) => console.error(`[scan-daemon] job ${claimed.id} crashed: ${String(err)}`));
    console.log(`[scan-daemon] job ${claimed.id} finished`);
  }
}

main().catch((err) => {
  console.error("[scan-daemon] fatal", err);
  process.exit(1);
});
