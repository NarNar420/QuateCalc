# Supplier Recon — Round 2 (2026-06-01)

Web recon via live HTTP fetch + web search (no Playwright needed for this phase). Five candidates
investigated in depth; several ruled out. Already-done (ACE, Home Center) and already-rejected
(Tambour) excluded.

> Caveat: produced by a search agent over public HTTP. Platform detection + price quotes are
> indicative and MUST be re-verified at adapter-build time (one early fetch returned a
> cross-contaminated Shopify-looking payload that turned out to be WordPress). Treat as a
> prioritized lead list, not ground truth.

---

## Ranked Summary Table

| Rank | Name (HE / EN) | URL | Platform | Prices ₪ | HTTP OK (no browser) | Catalog size | robots.txt |
|------|---------------|-----|----------|----------|----------------------|-------------|-----------|
| 1 | ועקנין / Vaknin Pro | vakninpro.co.il | WooCommerce | YES — ₪147 confirmed | YES — static HTML | ~500+ products (2 sitemaps) | Permissive; no crawl-delay |
| 2 | אתר בנייה / Bniyah | bniyah.co.il | WooCommerce | YES — ₪53 confirmed | YES — static HTML | 1,417 products (7 sitemaps) | Permissive; no crawl-delay |
| 3 | סיני סטור / Sinai Store | sinaistore.com | WooCommerce | YES — ₪22 confirmed | YES — static HTML | ~530+ products (4 sitemaps) | Permissive; no crawl-delay |
| 4 | קורצקי / Koretzki | koretzki.co.il | Custom ASP | YES — ₪215/₪119 confirmed | YES — server-rendered | ~850+ products (sitemap) | crawl-delay 7; product paths allowed |
| 5 | דוקטור האוס / D-House | d-house.co.il | Konimbo (Israeli SaaS) | YES — ₪21 confirmed | YES — static HTML | ~450 products (7 sitemap pages) | Permissive; crawl-delay 10 |

**Skip (no prices or not relevant):**
- ישפרו / Ispro — commercial real estate company, no product store.
- פוקס הום / Fox Home — Shopify, /products.json works, BUT home textiles/decor, not building materials.
- מקס סטוק / Max Stock — discount chain, no building-materials focus; 403.
- טופמרקט / TopMarket — CS-Cart, general electronics; not construction-primary.
- ג.א.א / G.A.A (gaa-shop.co.il) — Cashcow; prices NOT visible on listings (only "details & purchase").
- RAMO (ramo.co.il) — 403 on all requests (Cloudflare/anti-bot).
- ToolPoint (toolpoint.shop) — Shopify, USD, precision CNC tooling — not a construction retailer.

---

## Candidate 1 — ועקנין פרו / Vaknin Pro  ✅ RECOMMENDED
URL: https://www.vakninpro.co.il — WooCommerce (WordPress).
- Evidence: `/wp-content/uploads/`, `/product-category/` URLs, `product-sitemap.xml` + `product-sitemap2.xml`, OceanWP theme.
- Prices in static HTML: MAKITA grinder ₪589, Stanley organizer ₪28, wood stain ₪147.
- robots.txt: blocks only wp-admin/my-account/cart; no crawl-delay; no anti-bot.
- No browser needed (server-rendered WooCommerce).
- ~500+ products: building materials, plumbing, sanitary, paint, tools, gypsum, electrical.
- Adapter: WooCommerce HTML scraper, `/product-category/<slug>/?page=N`, selectors `.woocommerce-loop-product__title` + `.price .woocommerce-Price-amount`. Polite delay ≥1500ms.

## Candidate 2 — אתר בנייה / Bniyah  ✅ RECOMMENDED
URL: https://bniyah.co.il — WooCommerce.
- Evidence: wp-content, /product-category/ + /product/, `sitemap_index.xml` with 7 product sitemaps, Yoast.
- Prices static: padlock ₪53, chisel ₪14–26, PU sealant ₪432. 36/page; 1,417 total.
- robots.txt: blocks wp-admin + `?add-to-cart=`; no crawl-delay; no anti-bot.
- No browser needed.
- 1,417 products: tools, hardware (locks/hinges), plumbing, safety, storage.
- Adapter: same WooCommerce pattern as Vaknin (shared adapter). ≥1500ms.

## Candidate 3 — סיני סטור / Sinai Store  ✅ RECOMMENDED
URL: https://www.sinaistore.com — WooCommerce.
- Evidence: wp-content, /product-category/, `sitemap_index.xml` 4 product sitemaps, Yoast.
- Prices static: paint brush ₪22, power tools ₪699, ₪615, ₪4,500.
- robots.txt: blocks wp-admin + `?add-to-cart=`; no crawl-delay; no anti-bot.
- No browser needed.
- ~800–2,000 products: power tools, hand tools, building materials, paint, PPE, faucets, ceilings.
- Adapter: identical WooCommerce adapter (parameterize by base URL + slugs). ≥1500ms.

## Candidate 4 — קורצקי / Koretzki  ⚠️ VIABLE (custom ASP, more effort)
URL: https://www.koretzki.co.il — custom ASP.NET (`.asp` URLs, server-rendered).
- Prices static (orig + sale): ladder ₪249→₪215, hammer ₪149→₪119, drill ₪479→₪399, washer ₪699→₪589.
- robots.txt: crawl-delay 7s; product/listing allowed, only `?IsPostback=true` blocked; no Cloudflare.
- No browser needed.
- ~850 products, 6 departments; brands Stanley/Makita/Gorilla/Wolman.
- Adapter: bespoke ASP selectors, sitemap enumeration, crawl-delay ≥7000ms. More fragile (no standard class names).

## Candidate 5 — דוקטור האוס / D-House  ⚠️ VIABLE (Konimbo, medium effort)
URL: https://www.d-house.co.il — Konimbo (Israeli SaaS).
- Evidence: konimbo S3 image CDN, `/items/<id>-<slug>`, checkout at secure.konimbo.co.il.
- Prices static: cleaner ₪21, others ₪60/₪85/₪110; "משלוח חינם".
- robots.txt: Allow /; crawl-delay 10s; explicitly permits ClaudeBot/Googlebot; blocks admin/cart/search.
- No browser needed.
- ~450 products: tools, paint/adhesives, plumbing, electrical, cleaning, locks, kitchenware.
- Adapter: Konimbo `/items/<id>-<slug>` price-in-HTML. Same structure as Netanel Tools (shared adapter). ≥10000ms.

## Bonus — Netanel Tools (netaneltools.co.il)
Konimbo (same as D-House). Prices static (₪99 chisel set, ₪199 saw). crawl-delay 10. **1,478 products**.
A Konimbo adapter serves D-House + Netanel → ~1,900 products combined.

---

## Skip List — Dead Ends

| Name | URL | Reason |
|------|-----|--------|
| ישפרו / Ispro | ispro.co.il | Real-estate company, no store |
| פוקס הום / Fox Home | foxhome.co.il | Shopify w/ /products.json — but textiles/decor, not materials |
| ג.א.א / G.A.A | gaa-shop.co.il | Cashcow; prices hidden behind product-detail clicks |
| מקס סטוק / Max Stock | maxstock.co.il | General discount chain; 403; no materials focus |
| RAMO | ramo.co.il | 403 on all requests (anti-bot) |
| ToolPoint | toolpoint.shop | Shopify, USD, CNC tooling — not construction |
| TopMarket | topmarket.co.il | CS-Cart, electronics; not construction-primary |
| toolsil.co.il | toolsil.co.il | Affiliate price-comparison blog, not a retailer |
| Tambour | tambour.co.il | Round-1 reject: zero online prices |

---

## Implementation priority recommendation (recon agent)

1. **Shared WooCommerce adapter** (one adapter, three stores): Vaknin + Bniyah + Sinai. Static HTML,
   permissive robots, standard WC selectors. ~2,500+ products combined — best ROI.
2. **Konimbo adapter** (two stores): D-House + Netanel. Static HTML, crawl-delay 10s, ~1,900 products.
3. **Koretzki** stretch: custom ASP, crawl-delay 7s, ~850 products.

## Sources
ensun.io building-material/israel; woorank Shopify IL index; plus live fetches of each candidate.
