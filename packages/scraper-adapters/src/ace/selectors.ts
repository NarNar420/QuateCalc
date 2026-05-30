/**
 * All CSS selectors for the ACE adapter live here so that markup changes only
 * touch ONE file. The shapes model a generic e-commerce listing/category page.
 */
export const ACE_SELECTORS = {
  /** Category navigation: anchors to category listing pages. */
  categoryLink: "nav.main-categories a.category-link",

  /** A single product card on a listing page. */
  productCard: "li.product-item",
  /** Product name within a card. */
  productName: ".product-title",
  /** Product price text within a card. */
  productPrice: ".product-price",
  /** Optional unit/packaging hint within a card. */
  productUnit: ".product-unit",
  /** Anchor linking to the product detail page. */
  productLink: "a.product-link",
  /** SKU / catalog number element (often a data attribute on the card). */
  productSkuAttr: "data-sku",

  /** "Next page" pagination link (absent on the last page). */
  nextPage: "a.pagination-next",
} as const;
