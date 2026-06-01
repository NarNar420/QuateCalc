/**
 * CSS selectors for the GENERIC Konimbo adapter. Konimbo is an Israeli SaaS
 * store platform; a single platform adapter serves several Konimbo shops whose
 * THEMES differ only slightly, so the name/price selectors are intentionally
 * tolerant (a `.title` may be an `<h3>` on one shop and a `<p>` on another; the
 * card `.price` may likewise be a `<span>` or a `<p>`). Markup changes touch
 * ONLY this file; sale-vs-regular and prefix-stripping logic lives in parse.ts.
 *
 * Verified live (2026-06-01) against:
 *   - netaneltools.co.il (Netanel) — card name is <h3 class="title">, price <span class="price">
 *   - d-house.co.il      (D-House) — card name is <p class="title">,  price <p class="price">
 * Both share: product cards `.layout_list_item.item`, product links `/items/<id>-<slug>`
 * (hrefs carry leading whitespace + a trailing newline — parse.ts trims them),
 * a hidden `.items_show_price_text` "מחיר" label inside the price element (excluded),
 * a struck-through `.origin_price.line-through` old price (excluded), and a clean
 * absolute `<link rel="next">` in <head> for pagination.
 */
export const KONIMBO_SELECTORS = {
  /** A single product card on a category listing page (both themes tag it `layout_list_item item`). */
  productCard: ".layout_list_item.item",
  /**
   * Anchor whose href is the product page. Konimbo wraps the image, the title,
   * and the price each in their own `/items/...` anchor; we filter to hrefs
   * containing `/items/` in parse.ts and take the first resolvable one.
   */
  productLink: "a",
  /** Product name element — `<h3 class="title">` (Netanel) or `<p class="title">` (D-House). */
  title: ".title",
  /** The card's CURRENT price element — `<span class="price">` or `<p class="price">`. */
  price: ".price",
  /** Hidden "מחיר" label inside the price element — its text must be stripped out. */
  priceLabel: ".items_show_price_text",
  /** Struck-through ORIGINAL (pre-sale) price — excluded from the current price. */
  originPrice: ".origin_price",
  /** Clean absolute "next page" URL (Konimbo emits `<link rel="next">` in <head>). */
  nextPage: 'link[rel="next"], a[rel="next"]',
} as const;
