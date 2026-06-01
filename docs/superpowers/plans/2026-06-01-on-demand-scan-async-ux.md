# On-demand scan — Sub-project 2 (Async scan jobs + web UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web wizard scans live suppliers on demand for the user's material lines (async), lands ephemeral `scanned` rows, matches against them, and returns priced lines — via a Postgres-queued `ScanJob` consumed by a worker daemon.

**Architecture:** `POST /api/scan` inserts a `ScanJob` (`status=pending`); a worker `scan-daemon` polls Postgres, atomically claims the oldest pending job, runs scrape→insert-scanned→match→write-result, sets `complete`; the wizard polls `GET /api/scan/:id` and feeds the resulting `MatchedLineItem[]` into the existing Review step. No Redis (the table is the queue). Builds on sub-project 1 (`runSearch`, `scanned` rows, `matchLines({statuses})`).

**Tech Stack:** TypeScript (ESM/NodeNext), pnpm workspaces, Prisma + Postgres, Next.js (App Router, node runtime), Vitest.

**⚠️ One coordinated lockfile action:** Task 5 adds `@quatecalc/matching` to `apps/worker`. The maintainer must run `pnpm install` once (solo) at that point — it is called out explicitly in Task 5. Tasks 1–4 need no dependency changes.

---

## File structure

- `packages/db/prisma/schema.prisma` — `ScanJobStatus` enum + `ScanJob` model.
- `packages/db/prisma/migrations/<ts>_scan_job/migration.sql` — generated.
- `packages/db/src/repositories/scanJobs.ts` — ScanJob repo (create/get/claim/progress/complete/fail). (create)
- `packages/db/src/index.ts` — export the repo (already `export *`s repositories; add the new file).
- `packages/db/src/repositories/scanJobs.test.ts` — repo integration test. (create)
- `packages/contracts/src/scan.ts` — `ScanJobStatus`, `ScanProgress`, `ScanJobView` schemas. (create)
- `packages/contracts/src/index.ts` — export `./scan.js`.
- `apps/worker/src/scan/runScanJob.ts` — dep-injected orchestration. (create)
- `apps/worker/src/scan/runScanJob.test.ts` — offline orchestration test with fakes. (create)
- `apps/worker/src/scanDaemon.ts` — daemon entry: poll loop, real deps, prune. (create)
- `apps/worker/package.json` — add `@quatecalc/matching` dep + `scan-daemon` script (Task 5).
- `apps/web/app/api/scan/route.ts` — `POST`. (create)
- `apps/web/app/api/scan/[id]/route.ts` — `GET`. (create)
- `apps/web/app/components/steps/InputStep.tsx` — switch to scan→poll→match.
- `docs/WORKLOG.md` — live-proof entry.

---

## Task 1: DB — `ScanJob` model + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: migration folder (generated)

- [ ] **Step 1: Add the enum + model.** In `schema.prisma`, after the `MatchStatus` enum add:

```prisma
enum ScanJobStatus {
  pending
  scanning
  matching
  complete
  failed
}
```

and add the model (near the other models):

```prisma
model ScanJob {
  id         String        @id @default(cuid())
  region     Region
  // MaterialLine[] submitted by the client, as JSON.
  lines      Json
  status     ScanJobStatus @default(pending)
  // { perSupplier: { <key>: "pending"|"running"|"done"|"error" } }
  progress   Json          @default("{}")
  // MatchedLineItem[] once matched, as JSON.
  result     Json?
  error      String?
  createdAt  DateTime      @default(now())
  startedAt  DateTime?
  finishedAt DateTime?

  @@index([status, createdAt])
}
```

- [ ] **Step 2: Ensure Postgres up.** Run: `docker compose up -d`. Expected: containers healthy.

- [ ] **Step 3: Create the migration.** Run (DB url inline if needed, as in SP1):
`pnpm --filter @quatecalc/db exec prisma migrate dev --name scan_job`
Expected: migration created + applied. **NOTE (known SP1 trap):** `prisma migrate dev` may emit a spurious `DROP INDEX "CatalogProduct_nameNormalized_trgm_idx"` (the pg_trgm GIN index is managed by raw SQL). If it appears in the generated `migration.sql`, REMOVE that `DROP INDEX` line and append a re-assert so the migration is idempotent:
```sql
CREATE INDEX IF NOT EXISTS "CatalogProduct_nameNormalized_trgm_idx"
  ON "CatalogProduct" USING gin ("nameNormalized" gin_trgm_ops);
```
Then re-create it live if it was dropped, and confirm with `prisma migrate status`.

- [ ] **Step 4: Generate + typecheck.** Run: `pnpm --filter @quatecalc/db exec prisma generate && pnpm --filter @quatecalc/db typecheck`. Expected: clean.

- [ ] **Step 5: Verify the trgm index still exists** (guard against the trap):
Run: `docker exec quatecalc-postgres psql -U quatecalc -d quatecalc -c "SELECT indexname FROM pg_indexes WHERE tablename='CatalogProduct';"`
Expected: includes `CatalogProduct_nameNormalized_trgm_idx`.

- [ ] **Step 6: Commit.**
```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): ScanJob model + ScanJobStatus enum (on-demand scan queue)"
```

---

## Task 2: DB — ScanJob repository

**Files:**
- Create: `packages/db/src/repositories/scanJobs.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/repositories/scanJobs.test.ts`

- [ ] **Step 1: Write the failing integration test** `packages/db/src/repositories/scanJobs.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../client.js";
import {
  claimNextScanJob,
  completeScanJob,
  createScanJob,
  failScanJob,
  getScanJob,
  updateScanJobProgress,
} from "./scanJobs.js";

const created: string[] = [];
afterAll(async () => {
  if (created.length) await prisma.scanJob.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("scanJobs repo", () => {
  it("creates, claims, progresses, and completes a job", async () => {
    const job = await createScanJob({
      region: "center",
      lines: [{ id: "l1", rawText: "מלט", quantity: 1 }],
    });
    created.push(job.id);
    expect(job.status).toBe("pending");

    const claimed = await claimNextScanJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("scanning");

    // A second claim returns null (no more pending jobs from this one).
    // (Other suites may create jobs; we only assert OUR job is no longer claimable.)
    const again = await claimNextScanJob();
    expect(again?.id).not.toBe(job.id);

    await updateScanJobProgress(job.id, { perSupplier: { homecenter: "done" } });
    const mid = await getScanJob(job.id);
    expect((mid?.progress as { perSupplier: Record<string, string> }).perSupplier.homecenter).toBe("done");

    await completeScanJob(job.id, [{ ok: true }]);
    const done = await getScanJob(job.id);
    expect(done?.status).toBe("complete");
    expect(done?.result).toEqual([{ ok: true }]);
  });

  it("fails a job with an error message", async () => {
    const job = await createScanJob({ region: "center", lines: [] });
    created.push(job.id);
    await failScanJob(job.id, "boom");
    const done = await getScanJob(job.id);
    expect(done?.status).toBe("failed");
    expect(done?.error).toBe("boom");
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** (repo not found):
`pnpm --filter @quatecalc/db exec vitest run src/repositories/scanJobs.test.ts`

- [ ] **Step 3: Implement** `packages/db/src/repositories/scanJobs.ts`:

```ts
import type { Prisma, Region, ScanJob } from "@prisma/client";
import { prisma } from "../client.js";

export interface CreateScanJobInput {
  region: Region;
  lines: Prisma.InputJsonValue;
}

export async function createScanJob(input: CreateScanJobInput): Promise<ScanJob> {
  return prisma.scanJob.create({
    data: { region: input.region, lines: input.lines },
  });
}

export async function getScanJob(id: string): Promise<ScanJob | null> {
  return prisma.scanJob.findUnique({ where: { id } });
}

/**
 * Atomically claim the oldest pending job: flip exactly one `pending` row to
 * `scanning` and return it, or null if none. Uses a raw UPDATE ... WHERE id =
 * (SELECT ... FOR UPDATE SKIP LOCKED) so concurrent daemons never double-claim.
 */
export async function claimNextScanJob(): Promise<ScanJob | null> {
  const rows = await prisma.$queryRaw<ScanJob[]>`
    UPDATE "ScanJob"
    SET status = 'scanning'::"ScanJobStatus", "startedAt" = now()
    WHERE id = (
      SELECT id FROM "ScanJob"
      WHERE status = 'pending'::"ScanJobStatus"
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function updateScanJobProgress(
  id: string,
  progress: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.scanJob.update({ where: { id }, data: { progress } });
}

export async function completeScanJob(
  id: string,
  result: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.scanJob.update({
    where: { id },
    data: { status: "complete", result, finishedAt: new Date() },
  });
}

export async function failScanJob(id: string, error: string): Promise<void> {
  await prisma.scanJob.update({
    where: { id },
    data: { status: "failed", error, finishedAt: new Date() },
  });
}

/** Sweep stale `pending`/`scanning` jobs older than `olderThanMs` to `failed`. */
export async function sweepStaleScanJobs(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await prisma.scanJob.updateMany({
    where: { status: { in: ["pending", "scanning", "matching"] }, createdAt: { lt: cutoff } },
    data: { status: "failed", error: "stale (swept)", finishedAt: new Date() },
  });
  return res.count;
}
```

- [ ] **Step 4: Export** — in `packages/db/src/index.ts` add to the repository exports:
```ts
export * from "./repositories/scanJobs.js";
```

- [ ] **Step 5: Run the test, verify PASS.**
`pnpm --filter @quatecalc/db exec vitest run src/repositories/scanJobs.test.ts`

- [ ] **Step 6: Typecheck.** `pnpm --filter @quatecalc/db typecheck` (clean).

- [ ] **Step 7: Commit.**
```bash
git add packages/db/src/repositories/scanJobs.ts packages/db/src/repositories/scanJobs.test.ts packages/db/src/index.ts
git commit -m "feat(db): ScanJob repo (create/get/claim/progress/complete/fail/sweep)"
```

---

## Task 3: contracts — scan schemas

**Files:**
- Create: `packages/contracts/src/scan.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create** `packages/contracts/src/scan.ts`:

```ts
import { z } from "zod";
import { MatchedLineItemSchema } from "./matching.js";
import { RegionSchema } from "./common.js";

export const ScanJobStatusSchema = z.enum([
  "pending",
  "scanning",
  "matching",
  "complete",
  "failed",
]);
export type ScanJobStatus = z.infer<typeof ScanJobStatusSchema>;

export const SupplierScanStateSchema = z.enum(["pending", "running", "done", "error"]);
export type SupplierScanState = z.infer<typeof SupplierScanStateSchema>;

export const ScanProgressSchema = z.object({
  perSupplier: z.record(z.string(), SupplierScanStateSchema).default({}),
});
export type ScanProgress = z.infer<typeof ScanProgressSchema>;

/** The shape GET /api/scan/:id returns to the client. */
export const ScanJobViewSchema = z.object({
  id: z.string(),
  region: RegionSchema,
  status: ScanJobStatusSchema,
  progress: ScanProgressSchema,
  items: z.array(MatchedLineItemSchema).nullable(),
  error: z.string().nullable(),
});
export type ScanJobView = z.infer<typeof ScanJobViewSchema>;
```

(Confirm `MatchedLineItemSchema` is exported from `./matching.js` and `RegionSchema` from `./common.js` — both already exist and are used elsewhere.)

- [ ] **Step 2: Export** — in `packages/contracts/src/index.ts` add `export * from "./scan.js";` alongside the other re-exports.

- [ ] **Step 3: Typecheck.** `pnpm --filter @quatecalc/contracts typecheck` (clean).

- [ ] **Step 4: Commit.**
```bash
git add packages/contracts/src/scan.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): ScanJob status/progress/view schemas"
```

---

## Task 4: web API routes — POST /api/scan, GET /api/scan/:id

**Files:**
- Create: `apps/web/app/api/scan/route.ts`
- Create: `apps/web/app/api/scan/[id]/route.ts`

(`apps/web` already depends on `@quatecalc/db` + `@quatecalc/contracts`; no new dep.)

- [ ] **Step 1: POST** `apps/web/app/api/scan/route.ts`:

```ts
import { MaterialLineSchema, RegionSchema } from "@quatecalc/contracts";
import { createScanJob } from "@quatecalc/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  lines: z.array(MaterialLineSchema),
  region: RegionSchema,
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "קלט לא תקין", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const job = await createScanJob({
      region: parsed.data.region,
      lines: parsed.data.lines,
    });
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (err) {
    console.error("create scan job failed", err);
    return Response.json({ error: "לא ניתן ליצור משימת סריקה." }, { status: 500 });
  }
}
```

- [ ] **Step 2: GET** `apps/web/app/api/scan/[id]/route.ts`:

```ts
import { ScanProgressSchema, type ScanJobView } from "@quatecalc/contracts";
import { getScanJob } from "@quatecalc/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getScanJob(id);
  if (!job) {
    return Response.json({ error: "משימה לא נמצאה" }, { status: 404 });
  }
  const view: ScanJobView = {
    id: job.id,
    region: job.region,
    status: job.status,
    progress: ScanProgressSchema.parse(job.progress ?? {}),
    items: (job.result as ScanJobView["items"]) ?? null,
    error: job.error,
  };
  return Response.json(view);
}
```

(Note: Next 15 route handlers receive `params` as a Promise — `await params`. If this repo's Next version passes `params` synchronously, drop the `Promise<>`/`await`. Check `apps/web` Next version first.)

- [ ] **Step 3: Typecheck.** `pnpm --filter @quatecalc/web typecheck` (clean).

- [ ] **Step 4: Commit.**
```bash
git add apps/web/app/api/scan
git commit -m "feat(web): POST /api/scan + GET /api/scan/:id (enqueue + poll)"
```

---

## Task 5: worker — orchestration + scan-daemon  ⚠️ needs the one `pnpm install`

**Files:**
- Create: `apps/worker/src/scan/runScanJob.ts`
- Create: `apps/worker/src/scan/runScanJob.test.ts`
- Create: `apps/worker/src/scanDaemon.ts`
- Modify: `apps/worker/package.json` (add dep + script)

- [ ] **Step 1: Add the dependency + script** to `apps/worker/package.json`. In `dependencies` add `"@quatecalc/matching": "workspace:*"`, and in `scripts` add `"scan-daemon": "tsx src/scanDaemon.ts"`.

- [ ] **Step 2: 🚦 Maintainer runs `pnpm install` once (solo).** This records the `apps/worker → @quatecalc/matching` edge in `pnpm-lock.yaml` and links it. STOP and request this if you (an agent) cannot run it — do not hand-junction for a permanent dependency. After it completes, continue.

- [ ] **Step 3: Write the failing orchestration test** `apps/worker/src/scan/runScanJob.test.ts` (offline, all deps faked):

```ts
import type { ScraperAdapter, ScraperContext } from "@quatecalc/contracts";
import { describe, expect, it, vi } from "vitest";
import { runScanJob, type ScanJobDeps } from "./runScanJob.js";

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
    getJob: vi.fn(async () => ({
      id: "j1",
      region: "center",
      lines: [{ id: "l1", rawText: "מלט", quantity: 1 }],
    })),
    adapters: [fakeAdapter("homecenter", true), fakeAdapter("ace", true)],
    upsertSupplier: vi.fn(async (s) => ({ id: "sup-" + s.key })),
    buildContext: vi.fn((): ScraperContext => ({ fetchText: async () => "", region: "center", log: () => {} })),
    runSearch: vi.fn(async ({ adapter }) => ({
      supplierKey: adapter.supplierKey,
      region: "center",
      query: "מלט",
      products: [{ supplierKey: adapter.supplierKey, name: "מלט", nameNormalized: "מלט", unit: "bag", packSize: 1, price: 10, currency: "ILS", region: "center", url: "x", scrapedAt: new Date(), supplierId: "s" }],
      summary: { supplierKey: adapter.supplierKey, region: "center", startedAt: new Date(), finishedAt: new Date(), status: "success", productCount: 1, errorCount: 0, nullPriceRate: 0, promoted: false },
    })),
    insertScannedProducts: vi.fn(async (rows) => rows.length),
    matchLines: vi.fn(async () => [{ line: { id: "l1", rawText: "מלט", quantity: 1 }, status: "needs_review", selectedProduct: null, candidates: [], resolvedQuantity: null, resolvedUnit: null, packCount: null }]),
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
    expect(deps.runSearch).toHaveBeenCalledTimes(2); // homecenter + ace
    expect(deps.insertScannedProducts).toHaveBeenCalled();
    expect(deps.matchLines).toHaveBeenCalledWith(
      [{ id: "l1", rawText: "מלט", quantity: 1 }],
      expect.objectContaining({ region: "center", statuses: ["scanned"] }),
    );
    expect(deps.complete).toHaveBeenCalledWith("j1", expect.any(Array));
  });

  it("records a supplier error without failing the whole job", async () => {
    const deps = makeDeps({
      runSearch: vi.fn(async ({ adapter }) => {
        if (adapter.supplierKey === "ace") throw new Error("anti-bot");
        return { supplierKey: "homecenter", region: "center", query: "מלט", products: [], summary: { supplierKey: "homecenter", region: "center", startedAt: new Date(), finishedAt: new Date(), status: "success", productCount: 0, errorCount: 0, nullPriceRate: 0, promoted: false } };
      }),
    });
    await runScanJob("j1", deps);
    expect(deps.complete).toHaveBeenCalled();
    expect(deps.fail).not.toHaveBeenCalled();
    // ace marked error in a progress update
    const progressCalls = (deps.updateProgress as ReturnType<typeof vi.fn>).mock.calls;
    const sawAceError = progressCalls.some(
      ([, p]) => (p as { perSupplier: Record<string, string> }).perSupplier.ace === "error",
    );
    expect(sawAceError).toBe(true);
  });
});
```

- [ ] **Step 4: Run it, verify FAIL** (`./runScanJob.js` missing):
`pnpm --filter @quatecalc/worker exec vitest run src/scan/runScanJob.test.ts`

- [ ] **Step 5: Implement** `apps/worker/src/scan/runScanJob.ts` (dep-injected — imports only TYPES from matching to avoid a hard runtime coupling in the logic unit):

```ts
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
```

- [ ] **Step 6: Run the test, verify PASS** (2 tests).

- [ ] **Step 7: Implement the daemon** `apps/worker/src/scanDaemon.ts` (wires real deps; mirror how `refresh.ts` builds adapters + live context; ACE search needs the browser transport, HC needs HTTP — so build a context whose transport is the browser transport, exactly as `refresh.ts --browser` does, since the daemon serves all suppliers):

```ts
import { matchLines } from "@quatecalc/matching";
import {
  insertScannedProducts,
  claimNextScanJob,
  getScanJob,
  updateScanJobProgress,
  completeScanJob,
  failScanJob,
  pruneExpiredScanned,
  sweepStaleScanJobs,
  upsertSupplier,
} from "@quatecalc/db";
import { getAdapter, registerAllAdapters, runSearch } from "@quatecalc/scraper-core";
import { createBrowserTransport } from "@quatecalc/scraper-browser";
import { liveContextBuilder } from "./context.js";
import { runScanJob, type ScanJobRecord } from "./scan/runScanJob.js";

const POLL_MS = 1000;
const TTL_MS = 2 * 60 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;

async function main() {
  registerAllAdapters();
  // Build the full adapter list the daemon serves (the registry exposes them by key).
  const keys = ["homecenter", "ace"]; // extend as suppliers gain searchProducts
  const adapters = keys.map((k) => getAdapter(k)).filter((a): a is NonNullable<typeof a> => Boolean(a));

  const transport = createBrowserTransport();
  const buildCtx = liveContextBuilder({ transport });

  // eslint-disable-next-line no-console
  console.log("[scan-daemon] polling for pending scan jobs...");
  for (;;) {
    await sweepStaleScanJobs(STALE_MS).catch(() => 0);
    await pruneExpiredScanned().catch(() => 0);
    const claimed = await claimNextScanJob().catch(() => null);
    if (!claimed) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    console.log(`[scan-daemon] job ${claimed.id} claimed`);
    await runScanJob(claimed.id, {
      getJob: async (id) => {
        const j = await getScanJob(id);
        return j ? ({ id: j.id, region: j.region, lines: j.lines as ScanJobRecord["lines"] }) : null;
      },
      adapters,
      upsertSupplier,
      buildContext: (region) => buildCtx(region),
      runSearch,
      insertScannedProducts,
      matchLines,
      updateProgress: updateScanJobProgress,
      complete: completeScanJob,
      fail: failScanJob,
      ttlMs: TTL_MS,
      now: () => new Date(),
      log: (lvl, msg) => console[lvl === "error" ? "error" : "log"](`[scan-daemon] ${msg}`),
    });
    console.log(`[scan-daemon] job ${claimed.id} finished`);
  }
}

main().catch((err) => {
  console.error("[scan-daemon] fatal", err);
  process.exit(1);
});
```

(Adapt `liveContextBuilder`'s call shape + `createBrowserTransport` options to the real signatures in `context.ts`/`scraper-browser` — verify before writing. `getAdapter`/`runSearch` are exported from scraper-core per SP1.)

- [ ] **Step 8: Typecheck.** `pnpm --filter @quatecalc/worker typecheck` (clean).

- [ ] **Step 9: Commit.**
```bash
git add apps/worker/package.json apps/worker/src/scan apps/worker/src/scanDaemon.ts pnpm-lock.yaml
git commit -m "feat(worker): scan-daemon + dep-injected runScanJob orchestration"
```

---

## Task 6: web UI — InputStep scan→poll→match

**Files:**
- Modify: `apps/web/app/components/steps/InputStep.tsx`

- [ ] **Step 1: Replace the synchronous `/api/match` call** in `handleSubmit` with the scan flow. Keep `toPricedLine` and the existing UI; add a `progress` state and a polling loop. New `handleSubmit`:

```tsx
async function handleSubmit() {
  setError(null);
  if (parsed.length === 0) {
    setError("יש להזין לפחות שורת חומר אחת.");
    return;
  }
  setLoading(true);
  setProgress({});
  try {
    const start = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: parsed, region }),
    });
    if (!start.ok) {
      const b = await start.json().catch(() => ({}));
      throw new Error(b.error ?? "הסריקה נכשלה.");
    }
    const { jobId } = (await start.json()) as { jobId: string };

    const deadline = Date.now() + 90_000; // 90s cap
    for (;;) {
      if (Date.now() > deadline) throw new Error("הסריקה ארכה זמן רב מדי. נסו שוב.");
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/scan/${jobId}`);
      if (!res.ok) throw new Error("שגיאה בקבלת מצב הסריקה.");
      const view: ScanJobView = await res.json();
      setProgress(view.progress.perSupplier);
      if (view.status === "complete" && view.items) {
        onMatched(view.items.map(toPricedLine));
        return;
      }
      if (view.status === "failed") throw new Error(view.error ?? "הסריקה נכשלה.");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "הסריקה נכשלה.");
  } finally {
    setLoading(false);
  }
}
```

Add the import + state:
```tsx
import type { ScanJobView } from "@quatecalc/contracts";
// ...
const [progress, setProgress] = useState<Record<string, string>>({});
```

And render progress while loading (above `.actions`):
```tsx
{loading && Object.keys(progress).length > 0 && (
  <ul className="scan-progress" aria-live="polite">
    {Object.entries(progress).map(([supplier, state]) => (
      <li key={supplier}>
        {supplier}: {state === "done" ? "✓" : state === "error" ? "⚠" : state === "running" ? "סורק…" : "ממתין"}
      </li>
    ))}
  </ul>
)}
```

Update the button label from "מתאים..." to "סורק..." while loading.

- [ ] **Step 2: Typecheck.** `pnpm --filter @quatecalc/web typecheck` (clean).

- [ ] **Step 3: Commit.**
```bash
git add apps/web/app/components/steps/InputStep.tsx
git commit -m "feat(web): InputStep scans on demand (POST /api/scan + poll) with progress"
```

---

## Task 7: Live end-to-end proof + WORKLOG

**Files:**
- Modify: `docs/WORKLOG.md`

- [ ] **Step 1: Start Postgres + the daemon + web** (three terminals, local):
```bash
docker compose up -d
pnpm --filter @quatecalc/worker scan-daemon
pnpm --filter @quatecalc/web dev
```

- [ ] **Step 2: Exercise the wizard.** Open the web app, enter a few material lines (use terms present in the live feeds, e.g. "צבע"), region center, submit. Expected: progress list updates per supplier (homecenter done ✓, ace runs then done/error), then the Review step shows matched priced lines from `scanned` rows.

- [ ] **Step 3: Confirm cleanup.** After a couple minutes (or restart the daemon) confirm `pruneExpiredScanned` removed expired rows:
`docker exec quatecalc-postgres psql -U quatecalc -d quatecalc -c "SELECT count(*) FROM \"CatalogProduct\" WHERE status='scanned';"`

- [ ] **Step 4: Full repo gate.** `pnpm -r typecheck && pnpm -r test` (green; db integration tests run via `pnpm --filter @quatecalc/db exec vitest` as before).

- [ ] **Step 5: Append WORKLOG** under the Sub-project 2 heading:
```md
## Sub-project 2 — On-demand async scan jobs + web UX

### [2026-06-01] Async ScanJob queue + worker scan-daemon + wizard on-demand scan  (agent: claude-code/opus)
- **Task:** the web wizard scans live suppliers on demand (async) and matches against ephemeral rows.
- **Paths:** `packages/db` (ScanJob model + repo), `packages/contracts` (scan schemas), `apps/worker` (runScanJob + scanDaemon + matching dep), `apps/web` (/api/scan routes + InputStep).
- **Public API:** `ScanJob` repo (`createScanJob`/`getScanJob`/`claimNextScanJob`/`updateScanJobProgress`/`completeScanJob`/`failScanJob`/`sweepStaleScanJobs`); contracts `ScanJobView`/`ScanProgress`; `POST /api/scan`, `GET /api/scan/:id`; worker `scan-daemon`.
- **Tests:** <count> — scanJobs repo integration, runScanJob orchestration (fakes, supplier-error isolation), + existing suites.
- **Verified (LIVE, local):** wizard → POST /api/scan → daemon scanned <suppliers> for "<term>" → matched <N> lines in the Review step. Scanned rows pruned by the daemon.
- **Commit:** <hash>.
- **Status:** ✅ done. (Lockfile: added apps/worker → @quatecalc/matching; reconciled via one `pnpm install`.)
```

- [ ] **Step 6: Commit.**
```bash
git add docs/WORKLOG.md
git commit -m "docs(worklog): on-demand async scan jobs + web UX, live-proven"
```

---

## Notes for the implementer
- **Branch:** `feat/on-demand-scan` (continues SP1).
- **Ordering:** Tasks 1–4 need no dependency change and can be built + committed immediately. Task 5 Step 2 is the one human `pnpm install` gate — stop there if running unattended.
- **AGENTS.md gates:** per-package typecheck + test before each commit; append (never rewrite) the WORKLOG.
- **Scanned-row scoping caveat:** matching reads ALL `scanned` rows for the region. With a single local user this is fine; concurrent scans in the same region could intermingle candidates. If that becomes real, scope by tagging scanned rows with the job id (add `scrapeRunId = jobId` on insert and filter) — out of scope here, noted.
- **Verify before writing:** Next.js `params` Promise-vs-sync (Task 4), `liveContextBuilder`/`createBrowserTransport` real signatures (Task 5).
