import type {
  MatchedLineItem,
  MaterialLine,
  Region,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import type { StagedProductInput } from "@quatecalc/db";
import type { RunSearchParams, SearchResult } from "@quatecalc/scraper-core";

export interface ScanJobRecord {
  id: string;
  region: Region;
  lines: MaterialLine[];
}

export interface ScanJobDeps {
  getJob: (id: string) => Promise<ScanJobRecord | null>;
  adapters: ScraperAdapter[];
  upsertSupplier: (s: { key: string; name: string; baseUrl: string }) => Promise<{ id: string }>;
  buildContext: (region: Region) => ScraperContext;
  runSearch: (p: RunSearchParams) => Promise<SearchResult>;
  insertScannedProducts: (rows: StagedProductInput[], expiresAt: Date) => Promise<number>;
  matchLines: (lines: MaterialLine[], opts: { region: Region; statuses: ["scanned"] }) => Promise<MatchedLineItem[]>;
  updateProgress: (id: string, progress: { perSupplier: Record<string, string> }) => Promise<void>;
  complete: (id: string, items: MatchedLineItem[]) => Promise<void>;
  fail: (id: string, error: string) => Promise<void>;
  ttlMs: number;
  now: () => Date;
  log: (level: "info" | "warn" | "error", msg: string) => void;
}

/**
 * Run one scan job: for each search-capable adapter, search every line term,
 * collect normalized rows, persist them as ephemeral `scanned` rows, then match
 * the lines against the scanned rows and write the result. One supplier failing
 * is recorded as `error` in progress but never sinks the job; the job only
 * fails if matching throws.
 */
export async function runScanJob(jobId: string, deps: ScanJobDeps): Promise<void> {
  const job = await deps.getJob(jobId);
  if (!job) {
    await deps.fail(jobId, "job not found");
    return;
  }

  const searchable = deps.adapters.filter((a) => typeof a.searchProducts === "function");
  const perSupplier: Record<string, string> = {};
  for (const a of searchable) perSupplier[a.supplierKey] = "pending";
  await deps.updateProgress(jobId, { perSupplier: { ...perSupplier } });

  const terms = [...new Set(job.lines.map((l) => l.rawText).filter((t) => t.trim().length > 0))];
  const expiresAt = new Date(deps.now().getTime() + deps.ttlMs);
  const allRows: StagedProductInput[] = [];

  for (const adapter of searchable) {
    perSupplier[adapter.supplierKey] = "running";
    await deps.updateProgress(jobId, { perSupplier: { ...perSupplier } });
    try {
      const supplier = await deps.upsertSupplier({
        key: adapter.supplierKey,
        name: adapter.supplierName,
        baseUrl: adapter.baseUrl,
      });
      const ctx = deps.buildContext(job.region);
      for (const term of terms) {
        const res = await deps.runSearch({ adapter, query: term, ctx, supplierId: supplier.id });
        allRows.push(...res.products);
      }
      perSupplier[adapter.supplierKey] = "done";
    } catch (err) {
      perSupplier[adapter.supplierKey] = "error";
      deps.log("error", `supplier ${adapter.supplierKey} failed: ${String(err)}`);
    }
    await deps.updateProgress(jobId, { perSupplier: { ...perSupplier } });
  }

  if (allRows.length > 0) {
    try {
      await deps.insertScannedProducts(allRows, expiresAt);
    } catch (err) {
      deps.log("error", `insertScannedProducts failed: ${String(err)}`);
    }
  }

  try {
    const items = await deps.matchLines(job.lines, { region: job.region, statuses: ["scanned"] });
    await deps.complete(jobId, items);
  } catch (err) {
    await deps.fail(jobId, `match failed: ${String(err)}`);
  }
}
