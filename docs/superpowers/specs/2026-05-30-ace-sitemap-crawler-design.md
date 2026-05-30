# Design — ACE sitemap crawler (capped depth)

- **Date:** 2026-05-30
- **Status:** approved (design A); implementation pending
- **Branch:** `chore/matching-vitest-env` (continue)
- **Builds on:** `2026-05-30-tambour-live-scrape-design.md` (pivoted to ACE) +
  `docs/superpowers/recon/2026-05-30-supplier-recon.md`.

## Problem

The ACE listing adapter scrapes one category's **page 1** (~22–40 products). Deeper
pages use `?p=2`, which ACE's `robots.txt` disallows (`/*?`). So per-category depth is
capped at page 1. Goal: reach products beyond page 1 — toward full catalog — compliantly.

## Recon (decides the approach)

- `https://www.ace.co.il/sitemap.xml` is a **sitemapindex** → 5 child sitemaps
  (`/media/sitemap-5-*.xml`), all `.xml` (robots-allowed). One child alone lists **8,444
  numeric product URLs** (`/NNNNNNN`) plus category-slug URLs → ≈ tens of thousands total.
- A product page exposes a clean `Product` JSON-LD with
  `offers: { priceCurrency: "ILS", price: "11.78", availability }` — matching the listing
  price. **But it is JS-injected**: absent from the served HTML (`"@type":"Product"` = 0 in
  raw), present only after browser render. So per-product price needs the **browser transport**.
- Consequence: full catalog = tens of thousands of browser-rendered fetches at a polite
  rate = a multi-hour batch, not an interactive run.

## Approach (A — synthetic-category, capped)

Reuse the existing `ScraperAdapter` contract (no contract change). A factory builds a
sitemap-mode ACE adapter:

- `createAceSitemapAdapter({ maxProducts })` → `ScraperAdapter` with `supplierKey: "ace"`
  (promotes into the ACE catalog through the same runner + health gate).
- `listCategories` → one synthetic `CategoryRef` `{ key: "sitemap", url: <sitemap.xml> }`.
- `scrapeCategory` → fetch sitemap index → fetch child sitemaps → collect numeric product
  URLs → take the first `maxProducts` → for each: `ctx.fetchText(productUrl)` (browser) →
  parse the `Product` JSON-LD → yield `RawProduct { name, priceRaw, sku, url }`.
- **Cap** (`--max-products N`) bounds the run for politeness + interactive verification.
  Full catalog = the same code run unbounded as a scheduled batch (volume noted).

Rejected: **B** (new `listProductUrls()` contract method + runner product-mode) — cleaner
semantics but changes the shared contract and touches every adapter; not worth it for one
supplier. **Breadth** (sitemap leaf categories → page-1 listings) — a different feature; the
user chose depth.

## Components

| Path | Change |
|------|--------|
| `packages/scraper-adapters/src/ace/sitemap.ts` | NEW — pure parsers: `parseSitemapUrls(xml)` (index + urlset), `parseProductJsonLd(html)` → `{name, price, sku?, url}` or null |
| `packages/scraper-adapters/src/ace/sitemapAdapter.ts` | NEW — `createAceSitemapAdapter({ maxProducts })` |
| `packages/scraper-adapters/src/ace/sitemap.test.ts` | NEW — parser tests (offline fixtures) |
| `packages/scraper-adapters/src/ace/__fixtures__/sitemap-index.xml`, `sitemap-child.xml`, `product-jsonld.html` | NEW — trimmed real captures |
| `packages/scraper-adapters/src/index.ts` | export `createAceSitemapAdapter` |
| `apps/worker/src/refresh.ts` | `--sitemap` + `--max-products N`; when `--sitemap`, build the sitemap adapter (implies `--browser`) |

Untouched: contracts, db, scraper-core, scraper-browser, other adapters, the existing ACE
listing adapter (kept — both coexist).

## Price source

`Product` JSON-LD `offers.price` + `priceCurrency` (browser-rendered). `priceRaw` =
`"₪<price>"` (or pass the numeric string; `parsePrice` handles it). `sku` = JSON-LD `sku`
if present, else derived from the numeric product URL (consistent with listing `data-sku`).

## Error handling / politeness

- `--sitemap` without `--browser`: product JSON-LD won't render → 0 products → health gate
  fails (no promote). The worker should auto-enable browser for `--sitemap`, or refuse with
  a clear message. Decision: **auto-enable browser** when `--sitemap` (log it).
- robots respected for sitemap + product fetches (all allowed paths).
- Per-product fetch failures are skipped (logged), not fatal; health gate guards the catalog.
- Volume: WORKLOG must state the cap used and that an uncapped run is a long batch.

## Testing

- **Offline:** `parseSitemapUrls` (index → child URLs; urlset → product URLs, filters
  non-numeric), `parseProductJsonLd` (real product-page fixture → price/name/sku; missing
  JSON-LD → null). `createAceSitemapAdapter` with a stub `ctx.fetchText` serving the three
  fixtures → yields N products, respects `maxProducts`.
- **Live (manual):** `refresh --live --sitemap --max-products 25 --supplier ace` → ≥1
  product NOT on `tools-paint-affixing` page 1, promoted; spot-check a price vs the live site.
- Full repo gates green before commit.

## Done bar

Capped sitemap crawl promotes real ACE products (incl. some beyond category page 1) with
JSON-LD prices, through the health gate; offline parser tests green.
