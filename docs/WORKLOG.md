# WORKLOG — QuateCalc agent army

Append-only development log. Format & rules: see [`/AGENTS.md`](../AGENTS.md) §4.
Newest entry at the bottom of each wave. Test counts are per-package vitest runs.

---

## Wave 0 — Foundation (blocking)

### [2026-05-29] Wave 0 — monorepo + contracts + db + units  (agent: orchestrator/opus)
- **Task:** stand up the TS monorepo and freeze the shared contracts everyone codes against.
- **Paths:** root config, `packages/contracts`, `packages/db`, `packages/units`.
- **Public API:** `@quatecalc/contracts` (Region/Unit/Product/ScraperAdapter/Matching/Pricing/Quote schemas); `@quatecalc/db` (Prisma models + repositories + seed); `@quatecalc/units` (`normalizeHebrew`, `normalizeUnit`, `convertQuantity`, `resolvePackCount`).
- **Tests:** units 9 — Hebrew normalization, unit aliases, conversions, pack counts.
- **Verified:** migrations applied with `pg_trgm` + GIN index; seed loaded; trigram search returns correct top match against Postgres.
- **Commit:** `796c718`.
- **Status:** ✅ done.

---

## Wave 1 — Parallel core packages

### [2026-05-29] Wave 1 — scaffold  (agent: orchestrator/opus)
- **Task:** create package manifests + tsconfig for the 5 core packages and install deps ONCE (so parallel agents never race the lockfile).
- **Paths:** `packages/{pricing,export,matching,scraper-core,scraper-adapters}`.
- **Commit:** `2f9075f`. **Status:** ✅ done.

### [2026-05-29] Wave 1 — pricing engine  (agent: general-purpose/sonnet)
- **Task:** pure totals/overhead/margin/VAT calculation.
- **Paths:** `packages/pricing`.
- **Public API:** `computeQuote`, `computeTotals`, `computeLines`, `computeOverhead`, `round2`.
- **Tests:** 26 — rounding, fixed/percent overhead, margin on cost base, 18% VAT, full `computeQuote`, edge cases.
- **Verified:** offline unit tests; output validated against `QuoteSchema`.
- **Commit:** `7051ac8`. **Status:** ✅ done.

### [2026-05-29] Wave 1 — export engine  (agent: general-purpose/sonnet)
- **Task:** Excel + CSV export of a computed quote (Hebrew/RTL).
- **Paths:** `packages/export`.
- **Public API:** `exportQuote`, `toXlsx`, `toCsv`, `buildQuoteTable`.
- **Tests:** 17 — CSV BOM + escaping, RTL xlsx round-trip, totals/grand-total cells.
- **Verified:** offline; xlsx re-opened with ExcelJS to assert cells + `rightToLeft`.
- **Commit:** `7051ac8`. **Status:** ✅ done.

### [2026-05-29] Wave 1 — matching engine  (agent: general-purpose/opus)
- **Task:** map free-text Hebrew material lines to catalog SKUs.
- **Paths:** `packages/matching`.
- **Public API:** `matchLines`, `combinedScore`, `resolveQuantity`, `toCatalogProduct`.
- **Tests:** 14 — pure scoring, quantity/pack resolution, + 1 live-DB integration (region center).
- **Verified:** integration test matched "מלט אפור" to a "מלט"-containing product against seeded Postgres.
- **Commit:** `642bffb`. **Status:** ✅ done.

### [2026-05-29] Wave 1 — scraper core + ACE adapter  (agent: general-purpose/opus)
- **Task:** scraping framework + first supplier adapter.
- **Paths:** `packages/scraper-core`, `packages/scraper-adapters/src/ace`.
- **Public API:** `runScrape`, `registerAdapter`/`getAdapter`, `createRateLimiter`, `createRobotsChecker`, `createPageCache`, `createFetchText`, `parsePrice`; `aceAdapter`, `registerAceAdapter`.
- **Tests:** scraper-core 17, scraper-adapters 8 — parsePrice, rate limiter, runner health-gate (fake deps), fixture parsers + paginated adapter.
- **Verified:** fully offline/hermetic (no DB, no network).
- **Commit:** `e9dce09`. **Status:** ✅ done.

---

## Wave 2 — Integration (apps)

### [2026-05-30] Wave 2 — catalog refresh worker  (agent: orchestrator/opus)
- **Task:** the automated refresh job driving the runner + adapter (fixtures/live).
- **Paths:** `apps/worker`.
- **Public API:** `pnpm --filter @quatecalc/worker refresh -- [--supplier] [--region] [--fixtures|--live]`.
- **Tests:** 1 hermetic e2e (scrape→normalize→stage→promote, 5 fixture products).
- **Verified:** ran against real Postgres — staging→promote archived 15 old rows, promoted 5 fresh; `ScrapeRun` recorded.
- **Commit:** `0637d24` (worker + web scaffold). **Status:** ✅ done.

### [2026-05-30] Wave 2 — Hebrew/RTL web UI + API  (agent: general-purpose/opus)
- **Task:** 4-step wizard (input → review → configure → quote) + 5 API routes.
- **Paths:** `apps/web`.
- **Public API:** routes `/api/{match,catalog/search,overrides,quote,export}`; client wizard.
- **Tests:** 7 — `parseMaterials`.
- **Verified:** `next build` green; ran server and exercised match→quote→export against live Postgres (totals + 18% VAT correct = ₪2,688.83; CSV BOM + valid XLSX). Fixed `next.config.mjs` webpack `extensionAlias` for workspace TS resolution.
- **Commit:** `e00a231`. **Status:** ✅ done.

---

## Additive — suppliers

### [2026-05-30] Add Tambour (טמבור) supplier adapter  (agent: orchestrator/opus)
- **Task:** second supplier; modeled on WooCommerce markup (tambour.co.il/shop is WooCommerce).
- **Paths:** `packages/scraper-adapters/src/tambour`, `apps/worker` (supplier-aware fixtures).
- **Public API:** `tambourAdapter`, `registerTambourAdapter`, `registerAllAdapters`, `TAMBOUR_SELECTORS`.
- **Tests:** +7 (5 parse incl. sale-price, 2 adapter); worker e2e now 2 (ace + tambour).
- **Verified:** real Postgres — tambour scrape promoted 5 products (supplier-scoped, ACE untouched); cross-supplier match "סופרקריל לבן" → tambour ₪289; sale price ₪119.9 captured over struck-through ₪149.
- **Blocker noted:** live scrape of tambour.co.il returns **HTTP 403 (anti-bot/Cloudflare)** — real live prices need Wave 3 (Playwright/proxy + ToS approval). Fixtures model the real HTML structure meanwhile.
- **Commit:** `a09cf00`. **Status:** ✅ done (live data ⚠️ pending Wave 3).

---

## Wave 3 — Live scraping (anti-bot)

### [2026-05-30] Wave 3 — pluggable transport + Playwright browser fetch  (agent: orchestrator/opus)
- **Task:** solve live scraping behind anti-bot (Cloudflare 403) to enable broad cross-supplier price collection.
- **Paths:** `packages/scraper-core` (fetcher refactor), new `packages/scraper-browser`, `apps/worker` (`--browser`/`--proxy`).
- **Public API:** `Transport` type + `httpTransport` (scraper-core); `createBrowserTransport` + `stealthInitScript` (scraper-browser); `liveContextBuilder({ transport })` (worker). Adapters unchanged — transport is injected.
- **Tests:** scraper-core 19 (incl. new real-HTTP integration: robots+cache+rate-limit over a local server); scraper-browser 3 (stealth/UA, offline).
- **Verified:** full transport pipeline proven over real HTTP against a localhost server; browser transport is production code (lazy Chromium, stealth init, proxy support).
- **Blocker noted:** this sandbox blocks external egress (allowlist) AND the Playwright browser CDN (403), so a real live scrape / browser download can't run here — must run locally or in an env whose network policy allows the supplier + Playwright CDN. Code is ready for that.
- **Commit:** _(this commit)_. **Status:** ✅ done (machinery); ⚠️ real live run requires a permissive network env.

---

## Additive — local dev / tooling

### [2026-05-30] Local-run verification + matching test env loader  (agent: claude-code/opus)
- **Task:** verify the repo runs outside the build sandbox; fix the one test that required a manually-exported env var.
- **Paths:** `packages/matching` (new `vitest.config.ts`), `CLAUDE.md` (new, points to AGENTS.md so conventions auto-load).
- **Public API:** none (test-runner config + doc pointer only).
- **Tests:** full monorepo green cold — 112 passing across 9 packages (units 9, pricing 26, export 17, scraper-core 19, matching 14, scraper-adapters 15, scraper-browser 3, web 7, worker 2); typecheck 11/11.
- **Root cause:** no package loaded the root `.env`, so `matchLines`' Prisma call failed with `Environment variable not found: DATABASE_URL` under `pnpm -r test`. New `vitest.config.ts` reads the monorepo root `.env` via node fs (no new dependency) and exposes it through `test.env`; existing shell env wins, missing `.env` degrades gracefully.
- **Verified:** local toolchain (node 24.15.0, pnpm 10.33.0, docker 29.5.2); Postgres+Redis containers healthy; `pnpm --filter @quatecalc/matching test` passes with `DATABASE_URL` unset; `pnpm -r test` fully green cold.
- **Commit:** `b11dfa8`.
- **Status:** ✅ done.

---

## Wave 4 — Live price acquisition proven (ACE)

### [2026-05-30] Live scrape one category end-to-end — pivot Tambour→ACE  (agent: claude-code/opus)
- **Task:** prove the core price-acquisition pipeline against a real supplier, one category, through to a quote.
- **Recon finding (the pivot):** Tambour (`tambour.co.il`) is a **brand/spec catalog with zero online prices** — Cloudflare was never the blocker; the site simply doesn't publish prices (no `₪`/`Offer`/`priceCurrency` on listings or product pages). Done bar impossible there. Recon confirmed **ACE (`ace.co.il`) is a real priced Magento store** (no anti-bot, Knockout-rendered → browser transport required). Pivoted. See `docs/superpowers/recon/2026-05-30-supplier-recon.md`.
- **Paths:** `packages/scraper-core` (additive `categoryFilter`), `apps/worker` (`--category` flag, ACE fixture map, browser `waitForSelector`), `packages/scraper-adapters/src/ace/*` (real Magento selectors + parse + seeded category + real-capture fixture). Tambour adapter left intact (offline tests still green; just unused for live).
- **Public API:** `runScrape(..., { categoryFilter })`; worker `--category <key|substring>`. ACE adapter: real `.product-item-info` parsing, current-price = `.priceNum`(+`.ag`) excluding `.old-price`, protocol-relative URL resolve, `data-sku`; categories seeded (mega-menu discovery = future work).
- **Tests:** scraper-core 21 (+2 categoryFilter); ace parse 5 + adapter 2 rewritten against a trimmed real `category-listing.html`; worker e2e 2. Full repo: 113 passing, typecheck clean.
- **Verified (LIVE, local):** `refresh --live --browser --supplier ace --category tools-paint-affixing` scraped **22 real priced products** (nullPriceRate 0), promoted through the health gate (`status=partial` — page 2 `?p=2` correctly hit `RobotsDisallowedError`, page-1-only by design). Then end-to-end: free-text `"קרטון אריזה"` → matched `"ACE 60-40-40 קרטון אריזה" @ ₪11.78` → quote (subtotal ₪58.90, +overhead, +12% margin, +18% VAT) → **grandTotal ₪276.08** → valid RTL XLSX + BOM CSV.
- **Notes / future work:** (1) ACE robots disallows `/*?` so pagination (`?p=2`) is blocked → page-1-only; full catalog needs a robots-compliant pagination path or sitemap. (2) Mega-menu category discovery is seeded for now (one department). (3) **Seed collision — FIXED:** `packages/db/seed.ts` now seeds `supplierKey: "demo"` (was `"ace"`), so seeded sample data and a real ACE live scrape (`supplierKey: "ace"`) no longer clobber each other. matching stays green (it is supplier-agnostic, region-scoped).
- **Commit:** _(this commit)_.
- **Status:** ✅ done (one category, real prices → quote → Excel). ⚠️ full catalog + robots-compliant pagination pending.

---

## Wave 4 (cont.) — ACE sitemap crawler

### [2026-05-30] ACE sitemap crawler — capped depth  (agent: claude-code/opus)
- **Task:** reach ACE products beyond a category's page 1 (robots blocks `?p=`) via the sitemap, compliantly.
- **Paths:** `packages/scraper-adapters/src/ace/{sitemap,sitemapAdapter}.ts` (+ tests + fixtures); `apps/worker/src/refresh.ts` (`--sitemap`, `--max-products`).
- **Public API:** `createAceSitemapAdapter({ maxProducts })`, `parseSitemapLocs`, `isLeafCategoryUrl`; worker `--sitemap --max-products N` (auto-enables `--browser`).
- **Recon correction:** the sitemap's numeric-ending URLs (`/.../slug/102040102`) are **leaf-category listing pages, not products** — only bare `/1701065` URLs carry a `Product` JSON-LD (those pages have only a BreadcrumbList). First implementation (per-product JSON-LD) yielded 0 live. **Refactored:** discover leaf-category URLs from the sitemap → scrape each as a Magento **listing** via the shared `parseProducts` (prices render live). Doubles as real category discovery (supersedes the seeded single category).
- **Approach:** sitemap index → child sitemaps → leaf-category URLs (capped `MAX_LEAF_CATEGORIES=40`) → browser-render each listing → `parseProducts` → yield until `maxProducts`. Reuses runner + health gate; promotes under supplierKey `ace`.
- **Tests:** scraper-adapters sitemap suite (parseSitemapLocs, isLeafCategoryUrl, capped adapter) offline against trimmed real fixtures (`sitemap-index.xml`, `sitemap-child.xml`, real `category-listing.html`).
- **Verified (LIVE, local):** `refresh --live --sitemap --max-products 5` → discovered 40 leaf categories, scraped **5 real priced products, nullPriceRate 0, status=success, promoted=true**.
- **Volume / cost:** one child sitemap lists ~8,444 leaf URLs (≈ tens of thousands total). Each listing is a browser render. Bounded by `--max-products`; an uncapped full crawl is a multi-hour batch.
- **Commit:** `af19303` (refactor); `56b1f44`/`6f3e926` (initial + review fixes).
- **Status:** ✅ done (capped depth, live-proven; also provides category discovery). ⚠️ full-catalog batch + scheduling pending.
