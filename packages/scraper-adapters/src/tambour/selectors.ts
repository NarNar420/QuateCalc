/**
 * All CSS selectors for the Tambour adapter live here so markup changes touch
 * ONE file. Tambour's shop (tambour.co.il/shop/) is a WooCommerce store, so
 * these model the standard WooCommerce listing/category markup.
 */
export const TAMBOUR_SELECTORS = {
  /** Category tiles on the shop landing page. */
  categoryLink: "ul.product-categories a, li.product-category a",

  /** A single product card in a listing. */
  productCard: "ul.products li.product",
  /** Product name within a card. */
  productName: ".woocommerce-loop-product__title",
  /** Price block; the *current* amount is the last .amount (sale <ins> follows <del>). */
  productPrice: ".price .woocommerce-Price-amount",
  /** Optional size/unit hint (rarely present on WooCommerce listings). */
  productUnit: ".product-unit",
  /** Anchor to the product detail page. */
  productLink: "a.woocommerce-LoopProduct-link, a.woocommerce-loop-product__link",
  /** SKU exposed on the add-to-cart button data attribute, when present. */
  productSkuAttr: "data-product_sku",

  /** WooCommerce "next page" pagination link (absent on the last page). */
  nextPage: "nav.woocommerce-pagination a.next, a.next.page-numbers",
} as const;
