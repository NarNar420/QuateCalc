# Supplier recon — 2026-05-30 (Tambour ✗, ACE ✓)

Live recon via the Playwright browser transport, run locally. Raw captures kept in
the job tmp dir (uncommitted). This file is the data contract for the ACE adapter fix.

## Tambour — ABANDONED (no online prices)

- `tambour.co.il` is a WooCommerce shell but a **brand/spec catalog**, not a priced store.
- Browser cleared the site fine — **no Cloudflare challenge** (the spec's assumed risk was wrong).
- `robots.txt`: allows `/shop/` + `/product-category/`; `Crawl-delay: 10`.
- The modeled `/product-category/paints/` path is **404**; real category slugs are Hebrew
  (e.g. `/product-category/קטלוגים-ומניפות/`), host is non-www.
- **Decisive:** zero prices anywhere. Shop page + a product detail page
  (`/product/דבק-לאריחים-834.../`) both have `₪`=0, `מחיר`=0, no price markup, and JSON-LD
  with only BreadcrumbList/WebPage/WebSite — **no `Product`/`Offer`/`priceCurrency`**.
- Custom theme markup (`.product-item`, `.product-title`), not stock WooCommerce.
- **Conclusion:** the price-acquisition done bar is impossible for Tambour. Pivoted to ACE.

## ACE — SELECTED (real priced Magento store)

- `www.ace.co.il` is **Magento** (Luma + custom + Knockout.js). 165 `₪` / 161 price blocks on
  the home page. **No anti-bot challenge.** Renders cleanly via the browser transport.
- `robots.txt`: Magento defaults. Allows SEO category/product paths. **Disallows `/*?`** —
  so Magento pagination (`?p=2`) is robots-disallowed → scrape **page 1 only** (polite + compliant).
- **Browser transport is REQUIRED:** products are rendered client-side by Knockout
  (`data-bind`, `<!-- ko -->` templates). Plain HTTP returns empty templates. The rendered
  DOM (after JS) contains the real values — confirmed in capture.

### Category discovery
- Categories are SEO-slug paths from the mega-menu, hierarchical. Top departments include:
  `/tools-paint-affixing`, `/home-design-maintenance`, `/garden-furniture-outdoor-products`,
  `/kitchen-utensils-accessories`, `/lighting`, etc.
- **Done-bar category:** `https://www.ace.co.il/tools-paint-affixing`
  (h1 "כלי עבודה, צבע ופרזול" — tools/paint/hardware). 82 product cards, real prices, has pagination.
- Numeric URLs like `/1701065` are **products**, not categories (they carry recommendation
  carousels that reuse the same product-card component).

### Product card (category listing, rendered DOM)
- **Card:** `.product-item-info`
- **Name:** `a.product-item-link` → its inner `span[data-bind="html: name"]` text
  (e.g. `רובה CE-40 נטורה 2-11 ק"ג`). `.product-item-name .product-item-link` text also works.
- **URL:** `href` on `a.product-item-link` (or `a.product-item-photo`) — **protocol-relative**
  (`//www.ace.co.il/1208267`); resolve against `https://www.ace.co.il`.
- **SKU:** `data-sku` attribute on `a.product-item-link` (e.g. `1208267`).
- **Price block:** `.product-item-price .price-box.price-final_price`. Price digits are in
  `.priceNum` (shekels) with an optional sibling `.ag` (agorot), preceded by `<span class="symbol">₪</span>`.
  - When discounted: current price is inside `.special-price`, regular inside `.old-price`.
  - When not discounted: a single final-price block (no `.old-price`).
  - **Current-price rule:** take the `.priceNum` (+ optional `.ag`) that is **NOT** inside
    `.old-price`. Compose `priceRaw` as `₪<priceNum>.<ag>` (or `₪<priceNum>` when no `.ag`).
    Example: special ₪55 over old ₪64.90 → current `₪55`.

### Pagination
- Magento toolbar: `.pages` with `a.action.next` inside `li.item.pages-item-next`
  (href uses `?p=2`). **Robots-disallowed (`/*?`)** → effectively page-1-only here. The adapter
  may still parse the next link, but the robots-respecting fetch will return empty for `?p=`,
  stopping pagination cleanly. For the done bar, scrape page 1 only.

### Grid-ready signal (browser waitForSelector)
- Wait for `.priceNum` (ensures Knockout finished rendering prices), fallback `.product-item-info`.

### Politeness
- Set `SCRAPER_MIN_DELAY_MS` generously for live runs (ACE has no stated crawl-delay; keep ≥1500ms).
