/**
 * CSS selectors for the GENERIC WooCommerce adapter. One platform adapter
 * serves several WooCommerce shops whose THEMES differ, so the title selector
 * is a prioritized list of theme variants (Storefront/standard, WoodMart,
 * Impreza/USES, and the custom Vaknin theme). Markup changes touch ONLY this
 * file; sale-vs-regular price extraction lives in parse.ts (it needs DOM logic
 * around <del>/<ins>), not a single selector.
 *
 * Verified live (2026-06-01) against:
 *   - vakninpro.co.il  (custom theme: li.product / li.title>a / li.inner .price)
 *   - bniyah.co.il     (WoodMart:     div.product / h3.wd-entities-title>a / .price)
 *   - sinaistore.com   (Impreza/USES: article.product / .woocommerce-loop-product__title>a / p.price, sale uses <del>/<ins>)
 */
export const WOO_SELECTORS = {
  /**
   * A single product card on a listing/category page. All three themes tag the
   * card element with both `product` and `type-product`, regardless of whether
   * the element is an <li>, <div>, or <article>. Using both classes avoids
   * matching unrelated `.product` wrappers (e.g. subcategory tiles).
   */
  productCard: ".product.type-product",
  /**
   * Anchor carrying the product name (text) + href, tried in order. The href is
   * filtered to /product/ links in parse.ts so theme "category tile" anchors
   * that reuse the same title class are ignored.
   */
  titleLink: [
    "h3.wd-entities-title a", // WoodMart (Bniyah)
    ".woocommerce-loop-product__title a", // standard WooCommerce + Impreza/USES (Sinai)
    "li.title a", // Vaknin custom theme
    "a.woocommerce-LoopProduct-link", // fallback (image link carries title in aria-label/alt)
  ].join(", "),
  /** The price block container (Woo `.price`; Impreza adds `.product_field`). */
  priceBlock: ".price",
  /** A single rendered money amount inside a price block. */
  priceAmount: ".woocommerce-Price-amount",
  /** Wraps the CURRENT price on a sale product (standard WooCommerce). */
  priceIns: "ins",
  /** Wraps the struck-through OLD price on a sale product (to EXCLUDE). */
  priceDel: "del",
  /** Standard WooCommerce "next page" pagination link. */
  nextPage: "a.next.page-numbers",
} as const;
