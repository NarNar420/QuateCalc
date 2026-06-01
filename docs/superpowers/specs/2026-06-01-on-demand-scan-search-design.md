# On-demand scanning — Sub-project 1: Live search engine

**Date:** 2026-06-01
**Status:** design (approved in brainstorm; pending spec review)
**Branch:** `feat/on-demand-scan`

## Context

Today the catalog is acquired by **pre-scraping whole supplier catalogs** into Postgres
(`apps/worker` `refresh` → `runScrape` → stage → promote → `CatalogProduct status='current'`).
Matching (`packages/matching` `matchLines`) runs a region-scoped `pg_trgm` search
(`searchCatalogByTrigram`) over those `current` rows.

The product direction is **on-demand scanning**: scan suppliers for *only what a quote needs,
when it needs it*, and keep little-to-nothing long-term — to save space and stay fresh. Full
catalogs (ACE alone is tens of thousands of products) should not be hoarded.

The full feature is large, so it is split into two sub-projects:

1. **Live search engine (this spec)** — the backend capability to search a supplier on demand
   for a query term and land the results as short-lived, matchable catalog rows. Fully testable
   offline; no UX changes.
2. **Async scan jobs + web UX (later, own spec)** — `ScanJob` orchestration, `POST /api/scan`
   + polling, wizard wiring, prune scheduling. Builds on sub-project 1.

This spec covers **sub-project 1 only**.

## Goals

- A supplier adapter can be asked to **search** for a free-text term and stream matching products
  (live), in addition to the existing crawl-by-category capability.
- Scanned products are normalized through the **existing** pipeline and stored as **ephemeral**
  catalog rows that the **existing** trigram search + matching can consume unchanged.
- Ephemeral rows expire (TTL) and are prunable, so storage stays small.
- Proven against at least one live supplier.

## Non-goals (this sub-project)

- No async job system, no `/api/scan` route, no UI. (Sub-project 2.)
- No prune *scheduler* — only the prune query/function. (Wiring it to a schedule is sub-project 2.)
- No removal of the existing pre-scrape worker path. On-demand and pre-scrape coexist for now.

## Design

### 1. Contract change (`packages/contracts/src/scraper.ts`)

Add an **optional** method to `ScraperAdapter`:

```ts
export interface ScraperAdapter {
  // ...existing: supplierKey, supplierName, baseUrl, listCategories, scrapeCategory
  /**
   * Search the supplier's own search for `query` and stream matching products.
   * Optional: adapters whose supplier has no usable product search omit this;
   * the search engine skips them.
   */
  searchProducts?(query: string, ctx: ScraperContext): AsyncIterable<RawProduct>;
}
```

Additive and optional → the frozen contract is not broken; existing adapters keep compiling.

### 2. Search engine (`packages/scraper-core`)

New `runSearch`, sibling to `runScrape`. Same injected dependencies (transport, rate-limit,
robots, `PageCache`, logger), same normalization (`rawToStagedProduct`), same health summary.

```ts
export interface RunSearchParams {
  adapter: ScraperAdapter;
  query: string;            // raw free-text term (normalization handled downstream)
  ctx: ScraperContext;
  maxProducts?: number;     // safety cap per supplier per term
}
export interface SearchResult {
  supplierKey: string;
  region: Region;
  query: string;
  products: StagedProductInput[];   // normalized, ready to insert as scanned rows
  summary: ScrapeRunResult;         // reuse the existing health shape
}
export async function runSearch(p: RunSearchParams): Promise<SearchResult>;
```

Behavior:
- If `adapter.searchProducts` is undefined → return an empty `SearchResult` with
  `status: "success"`, `productCount: 0`, `notes: "adapter has no search capability"`.
- Otherwise drive the async iterable, normalize each `RawProduct` via the existing path,
  stop at `maxProducts`, compute `nullPriceRate`/`status` exactly like `runScrape`.
- Honors `ctx.signal` cancellation.

### 3. Adapter implementations (`packages/scraper-adapters`)

**Home Center (Shopify, HTTP).** Shopify exposes predictive search as JSON:
`GET /search/suggest.json?q=<term>&resources[type]=product&resources[limit]=10`.
New parser `parseShopifySearch(jsonText, { baseUrl })` (sibling of `parseShopifyProducts`)
reads `resources.results.products[].{title, url, price, variants?}`. `searchProducts` fetches
via `ctx.fetchText` and yields `RawProduct`s. Plain HTTP — no browser.
*(Field shape to be confirmed against a real captured fixture during implementation; the parser
is fixture-driven and skips entries missing title/price/url, same rule as `parseShopifyProducts`.)*

**ACE (Magento, browser).** `GET catalogsearch/result/?q=<term>` returns a Magento listing page
(Knockout-rendered → browser transport, already built). `searchProducts` fetches the rendered
HTML via `ctx.fetchText` and **reuses the existing `parseProducts`** (`.product-item-info`,
`.priceNum`+`.ag` excluding `.old-price`). Respects robots (the ACE listing path is allowed;
`?p=` pagination stays disallowed → first page of results only, which is the relevant set for a
search term).

Both register through the existing `registerAllAdapters()` in `src/index.ts`. No new registration
surface.

### 4. Database (`packages/db`)

**Migration** (`prisma/migrations`):
- Add `'scanned'` value to the `CatalogStatus` enum.
- Add nullable `expiresAt TIMESTAMP` to `CatalogProduct`.
- Index to make pruning cheap: `@@index([status, expiresAt])`.

**Repository** (`src/repositories/products.ts`):
- `insertScannedProducts(rows: StagedProductInput[], expiresAt: Date): Promise<number>` —
  bulk insert with `status: 'scanned'` and the given `expiresAt`.
- `pruneExpiredScanned(now?: Date): Promise<number>` — delete `status='scanned' AND expiresAt < now`.
- Extend `searchCatalogByTrigram` with an optional `statuses?: CatalogStatus[]`
  (default `['current']`). The SQL `WHERE status = 'current'` becomes `WHERE status = ANY(${statuses})`.
  On-demand callers pass `['scanned']`; every existing caller is unchanged by the default.

`scanned` rows are intentionally **not** promoted and **not** archived — they are ephemeral and
TTL-pruned. They never collide with the `staged→current→archived` lifecycle.

### 5. Matching (`packages/matching`)

Minimal: `MatchOptions` gains an optional `statuses?: CatalogStatus[]` passed straight through to
`searchCatalogByTrigram`. Default unchanged (`['current']`). The on-demand path (sub-project 2)
will call `matchLines(lines, { region, statuses: ['scanned'] })`. No scoring changes.

## Data flow (this sub-project, exercised by tests + a live proof)

```
query term ─► adapter.searchProducts (live, via ctx.fetchText)
           ─► RawProduct stream
           ─► runSearch: rawToStagedProduct (normalize Hebrew + price + unit)
           ─► StagedProductInput[]
           ─► db.insertScannedProducts(rows, expiresAt = now + TTL)   [status='scanned']
           ─► matchLines(lines, { region, statuses: ['scanned'] })    [reuses pg_trgm]
           ─► MatchedLineItem[]
later:     ─► db.pruneExpiredScanned()  removes expired rows
```

## Error handling

- Adapter without `searchProducts` → engine skips it cleanly (empty result, not an error).
- Search fetch failure (network/robots/anti-bot) → logged via `ctx.log`, counted into
  `errorCount`/`nullPriceRate`; `runSearch` returns a `partial`/`failed` summary rather than
  throwing, so one bad supplier never sinks a multi-supplier scan (sub-project 2 relies on this).
- A scanned-row insert is best-effort; a failed insert is logged and does not corrupt the
  `current` catalog (separate status, separate rows).

## Testing

Offline / hermetic (per AGENTS.md — no DB, no network in unit tests):
- `parseShopifySearch` — 2-3 cases against a trimmed real `search-suggest.json` fixture
  (priced product, missing-price skip, empty results).
- ACE `searchProducts` parse — reuses/extends the existing ACE listing fixture.
- `runSearch` — over a **fake transport + fake ctx**: yields normalized products, respects
  `maxProducts`, handles a no-`searchProducts` adapter, computes the health summary.
- db prune logic — unit test of the prune query against the repo (read-only/contained, per
  AGENTS.md integration rules) or a pure predicate test.

One **live proof** (local, like prior waves): `searchProducts("מלט")` (or similar common term)
against Home Center over real HTTP returns priced rows; piped through `runSearch` →
`insertScannedProducts` → `matchLines(..., { statuses: ['scanned'] })` yields a match. Recorded in
WORKLOG with counts, exactly like the ACE/HC live proofs.

## Verification gates (per AGENTS.md §2)

- `pnpm --filter @quatecalc/<pkg> typecheck` clean for every touched package.
- `pnpm --filter @quatecalc/<pkg> test` green; full `pnpm -r test` green.
- Live proof run recorded in `docs/WORKLOG.md`.

## Ownership / boundaries touched

`contracts` (search method), `scraper-core` (`runSearch`), `scraper-adapters`
(`searchProducts` for ace + homecenter, new Shopify search parser), `db` (migration + scanned
repo + search `statuses`), `matching` (pass-through `statuses`). Each change is additive and
behind a default that leaves existing behavior identical.

## Open items for implementation

- Confirm Shopify `search/suggest.json` field shape against a freshly captured fixture before
  finalizing `parseShopifySearch`.
- Pick the TTL default (proposed: a few hours) — final value set in sub-project 2 where the
  scan lifetime is user-visible; sub-project 1 just plumbs `expiresAt` through.
