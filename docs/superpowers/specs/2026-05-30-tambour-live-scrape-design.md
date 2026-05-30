# Design — Tambour live scrape: one category end-to-end

- **Date:** 2026-05-30
- **Status:** approved (design); pending implementation plan
- **Owner agent:** claude-code/opus
- **Branch:** `chore/matching-vitest-env` (continue here; do not merge until done bar met)
- **Revised:** 2026-05-30 — post-code-review: one-category scoping needs a real
  `--category` filter (not free); `refresh.ts` is in scope; robots-block + paint-term
  added to risks/verify.

## Problem

QuateCalc's core value is **automatic price acquisition** — scrape a real supplier,
build/refresh the catalog, then match → quote → export. All scraper machinery exists
and is green, but **only against hand-authored fixtures**. No adapter has ever parsed
real supplier HTML. The Tambour adapter's selectors are modeled on stock WooCommerce,
not derived from the live site, and `tambour.co.il` returns **HTTP 403 (Cloudflare
anti-bot)** to plain HTTP. So the main problem — real prices in the catalog — is unproven.

## Goal (done bar)

Real prices from **Tambour**, **one category**, scraped live via the browser transport,
promoted to the catalog through the health gate, then a **match → quote → Excel** run
on that real data. Proves the entire pipeline against reality. Full catalog and a second
supplier are explicitly out of scope for this spec.

## Non-goals

- Full Tambour catalog (all categories).
- ACE live scrape.
- Any change to contracts, DB schema, or `scraper-browser` (transport is already built).
- **Exception (necessary):** one-category scoping is **not** supported by the current
  code — `runScrape` loops every category from `adapter.listCategories()` and the worker
  has no category flag. Hitting the done bar requires a small, additive `--category`
  filter in `scraper-core/runner.ts` + `apps/worker/src/refresh.ts`. This is the only
  scraper-core change; it is additive (optional option, default = all categories, so
  existing behavior and tests are unchanged).
- CI-time live scraping. Live runs are a manual gate (need network + Chromium).

## Approach

**Approach A (recon-driven selector fix) as the spine**, with a structured-data check
during recon. Capture real HTML, fix the Tambour adapter to match, refresh fixtures from
the real capture, run one live category, promote, verify end-to-end. If recon shows clean
schema.org `Product` JSON-LD or a working `/wp-json/wc/store/v1/products` endpoint that
is clearly easier/more robust than theme CSS, switch *that one adapter* to it — decision
made at the recon gate, not before.

Rejected: committing to structured-data parsing outright (B) before confirming Tambour
exposes it; full multi-strategy normalization rework (C, YAGNI for one category).

## Phases

### Phase 0 — Setup
- Install Playwright Chromium locally:
  `pnpm --filter @quatecalc/scraper-browser install-browser`.
- **Stop-and-report** if the Playwright CDN download is blocked. No silent fallback.

### Phase 1 — Recon (investigative)
- Browser-fetch `https://www.tambour.co.il/shop/` and one real category page via the
  existing browser transport (the same `createBrowserTransport` the worker uses).
- Save **raw** HTML to `$CLAUDE_JOB_DIR/tmp` (not committed — may carry cookies/markers).
- Inspect and record: category-link markup, product-card selector, name, price block
  (incl. sale `<del>`/`<ins>`), SKU location, pagination ("next") markup, real category
  URL pattern.
- **Also** grep the captured HTML for `<script type="application/ld+json">` with
  `"@type":"Product"` and probe `/wp-json/wc/store/v1/products`.
- **Recon gate:** confirms (a) egress works, (b) stealth Chromium clears Cloudflare,
  (c) whether structured data is the better parser. If Cloudflare is NOT cleared, capture
  the challenge HTML, stop, and report options (tune `stealthInitScript`, raise
  `challengeWaitMs`, or `--proxy`). Do not proceed to fixes on a blocked recon.

### Phase 2 — Fix adapter
- Rewrite `packages/scraper-adapters/src/tambour/selectors.ts` and `parse.ts` to match
  the real markup observed in Phase 1 (or to read structured data if the gate chose it).
- Adjust category/pagination URL handling if the live structure differs from the modeled
  `/product-category/paints/` paths.

### Phase 3 — Fixtures + offline tests
- Replace hand-authored fixtures in `packages/scraper-adapters/src/tambour/__fixtures__/`
  with **trimmed, sanitized** real captures (strip cookies, tracking, irrelevant DOM;
  keep enough structure for the parser). Note in the fixture which live URL/date it came
  from.
- Update `tambour/parse.test.ts` and `tambour/adapter.test.ts` to assert against the real
  structure. Tests stay **offline** (no network) per AGENTS.md §2.
- If the worker's fixture URL→file map (`apps/worker/src/context.ts`) references category
  paths that changed, update the map (Tambour entry only).

### Phase 4 — One-category scoping (small additive code) + live run
- **Code:** add an optional category filter so the run can be limited to the recon-chosen
  category (politeness + fewer requests through Cloudflare = less likely to be blocked):
  - `scraper-core/runner.ts`: add `categoryFilter?: (c: CategoryRef) => boolean` to
    `RunScrapeOptions`; apply it to the discovered `categories` list before the loop.
    Default undefined = all categories (existing behavior + tests unchanged).
  - `apps/worker/src/refresh.ts`: add `--category <key|substring>` arg; when set, pass a
    `categoryFilter` matching that category's `key`/`label`/`url`.
- **Also fix in `refresh.ts`:** the browser transport's hardcoded
  `waitForSelector: "ul.products, ul.product-categories, li.product"` must be updated to
  whatever Phase 1 recon shows is the real "grid rendered" signal, else the page may be
  read before products render.
- **Run:**
  `pnpm --filter @quatecalc/worker refresh -- --live --browser --supplier tambour --region center --category <recon-category>`
- Run writes `staged` rows; the health gate (`runner.ts:157`) promotes to `current` only
  on a clean run, archiving old rows. A failed/empty scrape leaves the catalog untouched —
  existing behavior, no new safety code.

### Phase 5 — End-to-end verify
- Confirm real Tambour products with numeric prices are `current` in Postgres.
- Run a real Hebrew material line through match → quote → export; confirm a generated
  quote with real ₪ amounts and a valid XLSX/CSV.
- **The verify line must be a paint term** (Tambour's category is paints, e.g. סופרקריל /
  צבע), not a building-material term like מלט — match relies on token overlap with the
  scraped products, and the seed catalog (building materials) is a different domain.

## Components touched (ownership: in-bounds per AGENTS.md §1)

| Path | Change |
|------|--------|
| `packages/scraper-adapters/src/tambour/selectors.ts` | real selectors (or structured-data keys) |
| `packages/scraper-adapters/src/tambour/parse.ts` | parse real markup / structured data |
| `packages/scraper-adapters/src/tambour/__fixtures__/*.html` | real trimmed captures |
| `packages/scraper-adapters/src/tambour/parse.test.ts` | assert real structure |
| `packages/scraper-adapters/src/tambour/adapter.test.ts` | assert real structure |
| `apps/worker/src/context.ts` | Tambour fixture URL→file map, only if paths changed |
| `apps/worker/src/refresh.ts` | `--category` arg; update browser `waitForSelector` to real grid signal |
| `packages/scraper-core/src/runner.ts` | additive optional `categoryFilter` in `RunScrapeOptions` |

Untouched: contracts, db, units, matching, pricing, export, scraper-browser, ACE.
(`scraper-core` gets ONE additive, default-off option — see Non-goals exception.)

## Error handling / safety

- **Chromium download blocked** → stop, report, suggest manual install / proxy.
- **Cloudflare not cleared** → save challenge HTML, report tuning/proxy options, do not fake success.
- **Catalog safety** → health gate (`runner.ts`) guarantees a broken or empty scrape never
  promotes; real prices replace prior `current` rows only on a clean, health-passing run.
- **robots.txt may legitimately block** → if Tambour's robots.txt disallows `/shop/` or
  the category path, the robots-respecting fetch returns empty → 0 products → health gate
  `failed` → done bar unreachable. This is a real stop condition, not a bug: check
  `tambour.co.il/robots.txt` during recon. Do **not** disable `SCRAPER_RESPECT_ROBOTS` to
  force it — report instead (commercial scraping against robots is a ToS decision for the
  user, not a default).
- **Data hygiene** → raw captures stay in `$CLAUDE_JOB_DIR/tmp`; only trimmed, secret-free
  HTML is committed as fixtures. Never log full page bodies or secrets (AGENTS.md §5).
- **Legality** → Tambour is WooCommerce; respect robots.txt + rate limits (runner already
  wraps all transports). Commercial use should confirm ToS / prefer an official feed; this
  spec is a technical proof against the live site under polite, rate-limited access.

## Testing strategy

- **Offline (CI):** rewritten Tambour parse/adapter tests run against real-capture fixtures —
  no network. Existing worker e2e stays green on fixtures; add an assertion that the
  real-shaped fixture parses ≥1 product with a numeric price.
- **Live (manual gate):** one real browser scrape — needs network + Chromium, not in CI.
- **Done-bar proof:** a real Tambour product `current` in Postgres + a generated quote with
  real ₪ + a valid XLSX.

## Verification gates (AGENTS.md §2)

```
pnpm --filter @quatecalc/scraper-adapters typecheck   # zero errors
pnpm --filter @quatecalc/scraper-adapters test        # green, offline
pnpm --filter @quatecalc/scraper-core test            # runner + new categoryFilter
pnpm --filter @quatecalc/worker test                  # e2e still green
pnpm -r typecheck && pnpm -r test                     # whole repo before commit
```

The additive `categoryFilter` gets a `runner.test.ts` case (filter selects a subset;
undefined = all — proves existing behavior unchanged).

## Open risk

Recon is investigative: exact selector edits are unknowable until the real HTML is seen.
This spec fixes the **method**, not the literal CSS. If stealth Chromium cannot clear
Cloudflare locally, the done bar may require a proxy — a decision surfaced at the recon
gate, not assumed here.

## Logging / process

- One commit per completed workstream; subject `Add Tambour live scrape (one category)`.
- Append a WORKLOG entry per AGENTS.md §4 (task, paths, public API unchanged, tests,
  verified, commit, status). Log the recon outcome and any anti-bot blocker.
- Do not merge to `main` until the done bar is met and the user approves.
