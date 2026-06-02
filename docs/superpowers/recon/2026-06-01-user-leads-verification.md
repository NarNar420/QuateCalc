# Supplier Leads Verification — 2026-06-01

Recon for the QuateCalc price-scraping project. Six user-supplied Israeli
building-materials leads, fetched live (homepage + listing/leaf + `/robots.txt`,
plus `/products.json` for Shopify candidates).

Disqualifier reminder: **no prices online = SKIP**. Bonus: a plain-HTTP JSON
endpoint (Shopify `products.json`) or a static priced HTML table (no browser).

Reference baseline: ACE (Magento, browser) + Home Center (Shopify, HTTP) already adapted.

## Ranked summary

| # | URL | Type | Prices? | Platform | Verdict | Easiest approach |
|---|-----|------|---------|----------|---------|------------------|
| 1 | homreybinyan.co.il | Online store + cart | ✅ ₪255 faucet, ₪139 Sika | **Shopify** | **GOOD** | `products.json` over HTTP (no browser) |
| 4 | rotenberg1929.co.il/Catalog-Products-and-prices | Static priced catalog (flat tables, מקט + ex/inc VAT) | ✅ cement ₪18, sand ₪5.8 | Folyou (custom IL) | **GOOD** | Crawl leaf pages, parse HTML price tables |
| 6 | civileng.co.il/…גלם | Static מחירון reference page | ✅ B-30 concrete ₪260/m³, rebar ₪3000/t | Drupal (custom) | **MAYBE** | HTML table parse (low SKU count, est-only data) |
| 5 | binyan.click/…בנייף | WordPress lead-gen pricelist | ⚠️ ranges only (block ₪3.30, rebar ₪12+VAT) | WordPress | **MAYBE** | HTML parse — but "from ₪X" ranges, not real SKUs |
| 2 | xn----2hckhlca9aoh8f.com | WordPress lead-gen pricelist (same network as #5) | ⚠️ ranges only (block ₪1.10, cement ₪18–22) | WordPress/Yoast | **SKIP** | duplicate of #5's content; range-only |
| 3 | amrusi.co.il | Online store + cart | likely (403 to bot) | Wix/custom (`/f-admin/`) | **MAYBE** | 403 anti-bot — needs browser Transport |

---

## Per-lead detail

### 1. https://homreybinyan.co.il/ — "הראל ועידן הכל לבניין" — GOOD ✅
1. **Reachable:** Yes, 200. Operational store with cart + checkout.
2. **Type:** Full online store (shopping cart, collections, product pages).
3. **Prices visible:** Yes. Examples: `מוט פינוק אלמוג חמת` (faucet) → ₪255.00–349.00;
   `סיקה לסטיק 560` (Sika sealant) → ₪139.00–164.00. `products.json` first item:
   `סט מברגים 7 יחידות SIGNET` → variant price 75.00 (ILS), SKU null.
4. **Platform:** **Shopify** — CDN `homreybinyan.co.il/cdn/shop/files/`, Shopify checkout,
   valid `/products.json` (200, 16 products/page, standard schema), Shopify
   `/sitemap.xml` index (products/collections/pages/blogs sitemaps).
5. **robots.txt:** Standard Shopify. `/products.json` NOT disallowed; only admin/cart/
   search/filter params blocked. Sitemap declared. No Cloudflare/anti-bot. Crawl-delay
   only for AhrefsBot/MJ12bot/Pinterest.
6. **Browser needed?** No — plain HTTP `products.json` returns priced variants. Same
   pattern as the existing Home Center adapter.
7. **Breadth:** Single product sitemap file (mid/small catalog, <50k; likely a few
   hundred SKUs). Categories: building materials, ceramics/adhesives, paints, drywall,
   sealing, plumbing/sanitary, tools.
8. **Verdict:** **GOOD.** Priced + JSON over HTTP, no browser. Easiest: paginate
   `products.json?page=N` — reuse the Home Center Shopify adapter almost verbatim.

### 4. https://www.rotenberg1929.co.il/Catalog-Products-and-prices — GOOD ✅
1. **Reachable:** Yes, 200.
2. **Type:** Static priced **catalog** — category tiles drilling into leaf pages that
   render flat HTML price tables. (Also has a separate "קנייה אונליין" store link.)
3. **Prices visible:** Yes, on leaf pages (homepage/category index shows none — must
   drill in). Verified leaf `…/Materials-for-flooring-plaster-and-building-skeletor/…`:
   `חול זיפזיף שק 25 ק"ג` → 5.8 ₪ (ex-VAT) / 6.85 ₪ (inc); `מלט אפור נשר שק 25 ק"ג`
   → 18 ₪ / 21.2 ₪; `בלוק 20 2 ח'` → 4.82 ₪ / 5.68 ₪. Each row has item code (מקט) +
   ex/inc-VAT columns. This is high-quality structured data.
4. **Platform:** Folyou ("folyou - חנות אונליין בקלות"), a custom Israeli ecommerce CMS.
5. **robots.txt:** Disallows `/f-admin/`, checkout/cart, contact/newsletter across
   he/en/gr/ar locales. Catalog pages NOT disallowed. No Cloudflare/anti-bot.
6. **Browser needed?** No — prices are in server-rendered HTML tables (plain HTTP).
7. **Breadth:** Broad — many categories (insulation, gypsum, flooring/plaster/skeleton,
   sealing, paints, aluminum, tools/rental, plumbing). Multiple leaf pages each with
   tens of priced rows.
8. **Verdict:** **GOOD.** A priced table with מקט + VAT split is ideal for matching.
   Easiest: discover leaf-category URLs (sitemap/menu), then parse each table row →
   {מקט, name, price_ex_vat, price_inc_vat}. No browser.

### 6. https://www.civileng.co.il/…מחירון-חומרי-גלם — MAYBE
1. **Reachable:** Yes, 200.
2. **Type:** Static מחירון reference/informational page (no cart).
3. **Prices visible:** Yes. `בטון ב-30 שקיעה` → 260 ₪/m³; `ברזל מצולע` (ribbed steel)
   → 3,000 ₪/ton.
4. **Platform:** Drupal (custom). robots.txt is standard Drupal.
5. **robots.txt:** Blocks admin/login/system files; content pages open. Sitemap present.
   60s crawl-delay (slow but fine). No Cloudflare/anti-bot.
6. **Browser needed?** No — server-rendered HTML.
7. **Breadth:** Narrow — bulk raw materials only (concrete, rebar, sand/cement/lime,
   blocks, gypsum, shelter kits). Tens of line items, not a deep SKU catalog.
8. **Verdict:** **MAYBE.** Real ₪ prices and HTTP-parseable, but the page itself
   disclaims accuracy ("provided as estimates only") and breadth is thin/wholesale.
   Useful as a *reference benchmark* feed, not a primary retail catalog. Approach:
   single-page HTML table parse.

### 5. https://binyan.click/…מחירון-חומרי-בנייף — MAYBE
1. **Reachable:** Yes, 200.
2. **Type:** WordPress lead-gen pricelist / brochure (contact form + phone 072-3317722,
   no cart).
3. **Prices visible:** Yes but as examples/ranges: `בלוק בטון 10` → 3.30 ₪/unit;
   `מוט ברזל 8 מ"מ` → 12 ₪+VAT; `דבק קרמיקה AD 500` → from ₪38.
4. **Platform:** WordPress (`/wp-content/uploads/`).
5. **robots.txt:** Fully permissive (`Disallow:` empty). Sitemap `sitemap_index.xml`.
   No anti-bot.
6. **Browser needed?** No — static HTML.
7. **Breadth:** Small — blocks, cement, rebar, quarry, adhesives, with indicative prices.
8. **Verdict:** **MAYBE (low priority).** Prices are "from ₪X" marketing ranges, not
   firm per-SKU prices, so matching quality is weak. Approach: HTML parse if used at all.

### 2. https://xn----2hckhlca9aoh8f.com/ — "הכי משתלמים בחומרי בניין" — SKIP
1. **Reachable:** Yes, 200 (IDN/punycode for a Hebrew-name domain).
2. **Type:** WordPress lead-gen pricelist — **same template/network as binyan.click**
   (and labinyan.click). Contact via phone 073-7842748, no cart.
3. **Prices visible:** Range examples only: `בלוק בטון רגיל 10 ס"מ` → from ₪1.10/unit;
   `מלט אפור רגיל` → ₪18–22 / 25kg bag.
4. **Platform:** WordPress + Yoast SEO (robots.txt + `sitemap_index.xml`).
   NOTE: an early fetch of this URL returned Shopify-looking content for
   "הראל ועידן" — that was a cache/cross-contamination artifact; the authoritative
   robots.txt and a clean re-fetch both confirm WordPress brochure, NOT Shopify.
5. **robots.txt:** Permissive; Yoast sitemap. No anti-bot.
6. **Browser needed?** No.
7. **Breadth:** Same range-only catalog as #5.
8. **Verdict:** **SKIP.** Duplicate, range-only data of the same WordPress network as
   #5 — no incremental value. If the network is ever worth scraping, scrape one node (#5).

### 3. https://www.amrusi.co.il/ — "אמרוסי כל-בו לבניין" — MAYBE
1. **Reachable:** Homepage + category both return **HTTP 403** to the fetcher
   (bot/UA block). Site is live and active per web index (pages updated Mar 2026).
2. **Type:** Online store ("רכישה במחירים בלעדיים", WhatsApp ordering, fast delivery) —
   confirmed via search index, not directly fetchable.
3. **Prices visible:** Could not confirm directly (403). Indexed category pages titled
   "מחירון" (e.g. "מחירון צנרת אינסטלציה") strongly imply prices, but UNVERIFIED.
4. **Platform:** Custom/Wix-style — robots.txt references `/f-admin/` and per-locale
   (he/en/gr/ar) cart/checkout/newsletter paths, consistent with an Israeli store
   builder. Not Shopify (no products.json tested due to 403).
5. **robots.txt:** Blocks `/f-admin/`, checkout/cart, contact, newsletter per locale.
6. **Browser needed?** **Likely yes** — plain HTTP is 403'd (anti-bot); would need the
   Playwright browser Transport (like the ACE adapter) with a real UA.
7. **Breadth:** Broad catalog (building materials, plumbing, sanitary, paint, plaster,
   electrical, tools — many category pages indexed).
8. **Verdict:** **MAYBE.** Promising real store but gated by 403 anti-bot and prices
   unconfirmed. Needs a browser session to verify before committing. Approach: browser
   Transport → render category pages → parse listing prices.

---

## Cross-lead note
Leads #2 and #5 (and labinyan.click found in search) are the **same WordPress
lead-gen pricelist network** — identical template, range-only "from ₪X" prices,
phone-quote CTA. Treat as one low-value source at most.
