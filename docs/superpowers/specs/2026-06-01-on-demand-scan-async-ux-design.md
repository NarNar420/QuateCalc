# On-demand scanning — Sub-project 2: Async scan jobs + web UX

**Date:** 2026-06-01
**Status:** design (pending architecture pick + spec review)
**Branch:** `feat/on-demand-scan` (continues on top of sub-project 1)

## Context

Sub-project 1 shipped the **live search engine**: `ScraperAdapter.searchProducts?()`, scraper-core
`runSearch` (DB-free, returns normalized rows + health summary), HC + ACE implementations, ephemeral
`scanned` `CatalogProduct` rows (`expiresAt` + `insertScannedProducts`/`pruneExpiredScanned`), and
`matchLines(_, { statuses:['scanned'] })`. Today the web wizard's `InputStep` calls
`POST /api/match` **synchronously** against the pre-scraped `current` catalog.

Sub-project 2 makes the wizard **scan on demand**: when the user submits material lines, the app
scans the live suppliers for those terms, lands ephemeral `scanned` rows, matches against them, and
returns priced lines — all behind an **async job** (decided in brainstorm: "all suppliers, async
job", because ACE needs a multi-second Playwright render that must not block the request).

## Goals

- `POST /api/scan { lines, region }` starts an async scan job and returns a `jobId`.
- The job scans every live supplier that implements `searchProducts`, for each line's term, lands
  `scanned` rows (TTL), then runs `matchLines(lines, { statuses:['scanned'] })`.
- `GET /api/scan/:id` returns `{ status, progress, items? }`; the wizard polls it, shows per-supplier
  progress, and on completion hands `items` to the existing `onMatched` → Review step (unchanged).
- Expired `scanned` rows are pruned on a schedule.
- The pre-scrape path still works (on-demand is the wizard's default; `current` catalog stays usable).

## Non-goals

- No change to Review/Config/Quote steps or the pricing/export flow — they consume `PricedLine[]`
  exactly as today.
- No new supplier adapters (that's the parallel suppliers track).
- No auth/multi-user concerns (local tool).

## Data model (agreed regardless of architecture)

New Prisma model `ScanJob`:
```prisma
enum ScanJobStatus { pending scanning matching complete failed }

model ScanJob {
  id         String        @id @default(cuid())
  region     Region
  lines      Json          // the MaterialLine[] submitted
  status     ScanJobStatus @default(pending)
  progress   Json          // { perSupplier: { ace: "done"|"running"|"pending"|"error", ... } }
  result     Json?         // MatchedLineItem[] when complete
  error      String?
  createdAt  DateTime      @default(now())
  finishedAt DateTime?
  @@index([status, createdAt])
}
```
Scanned rows continue to use the SP1 `scanned` status + `expiresAt`; the scan job's TTL stamps
`expiresAt = now + SCAN_TTL` (proposed default **2 hours**).

## THE ARCHITECTURE FORK — where the scan executes

ACE search needs a Playwright (Chromium) render; HC is plain HTTP. Two clean ways to run this:

### Option A — In-process in the Next.js server (fewer moving parts)
`POST /api/scan` writes a `ScanJob` (status `pending`), then fires an async `executeScan(jobId)`
**without awaiting** (returns `jobId` immediately). `executeScan` lives in a server-only module in
`apps/web` and imports `@quatecalc/scraper-core`, `@quatecalc/scraper-adapters`,
`@quatecalc/scraper-browser`, `@quatecalc/db`, `@quatecalc/matching`. It builds the same live context
the worker uses, runs `runSearch` per supplier/term, inserts scanned rows, matches, writes
`result` + `status='complete'`. `GET /api/scan/:id` reads the row.
- **Pros:** one process (`next dev`), simplest dev/run UX, no queue.
- **Cons:** loads Playwright/Chromium inside the Next server process — heavier memory, and Next's
  bundler needs `scraper-browser` marked external (`serverExternalPackages`). Fire-and-forget work in
  a Next route is non-durable (a server restart mid-scan orphans a `pending` job — mitigated by a
  stale-job sweep).

### Option B — Worker as a queue consumer (clean separation) — RECOMMENDED
`POST /api/scan` writes a `ScanJob` and pushes its id to a Redis list (ioredis already a dep). A new
worker mode `pnpm --filter @quatecalc/worker scan-daemon` blocks on that list, runs the scan (browser
is native to the worker — where it already lives), writes scanned rows + `result` + `status`. The web
app polls Postgres. Web depends only on `@quatecalc/db` + `@quatecalc/matching` (no browser deps).
- **Pros:** browser/scrape stack stays in the worker (its existing home); web stays light; durable
  queue; scans survive a web restart; scales to background batch later.
- **Cons:** two processes to run in dev (`next dev` + the scan daemon); a small Redis queue protocol.

**Recommendation: B** — it keeps the package boundaries clean (AGENTS.md §1/§6: scraping stays in the
scraper-* packages + worker; web is UI/API), avoids Playwright-in-Next bundling pitfalls, and matches
the existing architecture where the worker owns scraping. The cost is one extra dev process, acceptable
for this tool. Option A is the pick only if "single process" is worth the Playwright-in-Next risk.

> This is the one decision needed before the plan. Everything else below is architecture-agnostic.

## Components (architecture-agnostic)

1. **contracts** — `ScanJobStatus`, `ScanProgress`, `ScanJobView` (the GET response) Zod schemas.
2. **db** — `ScanJob` model + migration; repo `createScanJob`, `getScanJob`, `updateScanJobProgress`,
   `completeScanJob`, `failScanJob`. (Reuses SP1 `insertScannedProducts`/`pruneExpiredScanned`.)
3. **scan orchestration** — a `runScanJob(jobId, deps)` function: load job → for each live adapter with
   `searchProducts`, for each line term → `runSearch` → collect rows → `insertScannedProducts(rows, ttl)`
   → `matchLines(lines, { region, statuses:['scanned'] })` → `completeScanJob(result)`. Updates
   `progress` per supplier as it goes. This function is the SAME in A or B — only its **caller**
   differs (Next route fire-and-forget vs worker daemon loop). Lives in a small server module
   (`apps/web/app/lib/scan` for A, or `apps/worker/src/scan` for B; final home set by the pick).
4. **web API** — `app/api/scan/route.ts` (`POST`) + `app/api/scan/[id]/route.ts` (`GET`).
5. **web UI** — `InputStep` submits to `/api/scan`, then polls `/api/scan/:id` every ~1.5s, showing a
   per-supplier progress list (ACE: rendering…, Home Center: done ✓). On `complete`, maps
   `result` (MatchedLineItem[]) through the existing `toPricedLine` → `onMatched` → Review step.
   On `failed`, shows the error. A timeout cap (~60s) surfaces a friendly message.
6. **prune schedule** — `pruneExpiredScanned` wired to run periodically (a small interval in the scan
   daemon for B, or a Next route-segment/cron-ish sweep for A) + opportunistically at job start.

## Data flow

```
InputStep submit ─► POST /api/scan {lines, region}
                 ─► createScanJob → (A: fire executeScan | B: RPUSH redis queue) → { jobId }
InputStep poll   ─► GET /api/scan/:id ──► { status, progress, items? }   (~1.5s interval)
scan executor    ─► per supplier/term: runSearch (HC http / ACE browser)
                 ─► insertScannedProducts(rows, now+TTL)
                 ─► matchLines(lines, { region, statuses:['scanned'] })
                 ─► completeScanJob(jobId, MatchedLineItem[])
InputStep done   ─► items.map(toPricedLine) → onMatched → Review (unchanged)
prune            ─► pruneExpiredScanned() on schedule
```

## Error handling

- One supplier failing (network/anti-bot) → recorded in `progress.perSupplier[x]='error'`, job still
  completes with whatever matched (`runSearch` already returns `partial`/`failed` per supplier without
  throwing). A job only `failed`s if matching itself throws or zero suppliers produced rows.
- Stale `pending`/`scanning` jobs older than N minutes → swept to `failed` (covers a crashed
  executor / restart).
- Web poll handles `failed` + a client-side timeout.

## Testing

- db: `ScanJob` repo integration test (create → update progress → complete; isolated, cleaned up).
- orchestration: `runScanJob` over **fake adapters + fake ctx + fake db deps** (offline) — asserts it
  scans each supplier, inserts rows, matches, writes result, records per-supplier progress, and that a
  throwing supplier degrades to `error` without sinking the job.
- web API: `POST` returns a jobId + creates a job; `GET` returns the view; (route tests with a fake db).
- web UI: a component test for `InputStep` polling state machine (mock fetch) — pending→scanning→complete
  → calls `onMatched`.
- Live proof: run the wizard end-to-end locally — type lines, watch progress, get a quote — recorded in
  WORKLOG (HC over HTTP at minimum; ACE if the local env allows the browser render).

## Verification gates (AGENTS.md §2)

Per-package `typecheck` + `test` green; full `pnpm -r test`; live wizard run recorded in WORKLOG.

## Open items

- **Architecture pick (A vs B)** — blocks the plan.
- `SCAN_TTL` default (proposed 2h) and poll interval (proposed 1.5s) — final values during build.
- Whether `apps/web` may gain new workspace deps (matching is already a dep; A would add
  scraper-core/adapters/browser → a coordinated `pnpm install`; B avoids that). This reinforces B.
