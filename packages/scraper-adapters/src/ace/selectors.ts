/**
 * CSS selectors for the ACE adapter (ace.co.il — Magento, Knockout-rendered).
 * Markup changes touch ONLY this file. Prices need custom handling (special vs
 * old vs agorot), so price extraction lives in parse.ts, not a single selector.
 */
export const ACE_SELECTORS = {
  /** A single product card on a category listing page. */
  productCard: ".product-item-info",
  /** Anchor carrying the product name (text), SKU (data-sku), and href. */
  productLink: "a.product-item-link",
  /** SKU attribute on the product link. */
  productSkuAttr: "data-sku",
  /** Price block; the CURRENT price is the .price NOT inside .old-price. */
  priceCurrent: ".product-item-price .price",
  /** Shekel integer + agorot fraction within a price block. */
  priceNum: ".priceNum",
  priceAgorot: ".ag",
  /** Container marking the struck-through regular (old) price to EXCLUDE. */
  oldPrice: ".old-price",
  /** WooCommerce-style "next page" link (Magento toolbar). */
  nextPage: "li.item.pages-item-next a, a.action.next",
} as const;
