# Design — Tambour live scrape: one category end-to-end

- **Date:** 2026-05-30
- **Status:** approved (design); pending implementation plan
- **Owner agent:** claude-code/opus
- **Branch:** `chore/matching-vitest-env` (continue here; do not merge until done bar met)

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
- Any change to contracts, DB schema, `scraper-core`, or `scraper-browser` (transport
  is already built). Adapter pattern means **only the Tambour adapter folder changes**,
  plus possibly the worker's fixture URL→file map.
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

### Phase 4 — Live run (one category)
- `pnpm --filter @quatecalc/worker refresh -- --live --browser --supplier tambour --region center`,
  scoped to the single recon-chosen category.
- Run writes `staged` rows; the runner health gate promotes to `current` only on a clean
  run, archiving old rows. A failed/empty scrape leaves the catalog untouched (existing
  `runner.ts` behavior — no new code needed for safety).

### Phase 5 — End-to-end verify
- Confirm real Tambour products with numeric prices are `current` in Postgres.
- Run a real Hebrew material line through match → quote → export; confirm a generated
  quote with real ₪ amounts and a valid XLSX/CSV.

## Components touched (ownership: in-bounds per AGENTS.md §1)

| Path | Change |
|------|--------|
| `packages/scraper-adapters/src/tambour/selectors.ts` | real selectors (or structured-data keys) |
| `packages/scraper-adapters/src/tambour/parse.ts` | parse real markup / structured data |
| `packages/scraper-adapters/src/tambour/__fixtures__/*.html` | real trimmed captures |
| `packages/scraper-adapters/src/tambour/parse.test.ts` | assert real structure |
| `packages/scraper-adapters/src/tambour/adapter.test.ts` | assert real structure |
| `apps/worker/src/context.ts` | Tambour fixture URL→file map, only if paths changed |

Untouched: contracts, db, units, matching, pricing, export, scraper-core, scraper-browser, ACE.

## Error handling / safety

- **Chromium download blocked** → stop, report, suggest manual install / proxy.
- **Cloudflare not cleared** → save challenge HTML, report tuning/proxy options, do not fake success.
- **Catalog safety** → health gate (`runner.ts`) guarantees a broken or empty scrape never
  promotes; real prices replace prior `current` rows only on a clean, health-passing run.
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
pnpm --filter @quatecalc/worker test                  # e2e still green
pnpm -r typecheck && pnpm -r test                     # whole repo before commit
```

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
