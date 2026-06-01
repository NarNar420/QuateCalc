import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
// Generic Shopify parser, reused read-only from the Home Center adapter folder
// (homreybinyan.co.il is the same Shopify /products.json shape).
import { parseShopifyProducts } from "../homecenter/shopify.js";

const BASE_URL = "https://homreybinyan.co.il";
/** Shopify product feed, page 1. ?page= is robots-disallowed, so one page (max 250). */
const PRODUCTS_URL = `${BASE_URL}/products.json?limit=250`;

export const homreybinyanAdapter: ScraperAdapter = {
  supplierKey: "homreybinyan",
  supplierName: "הראל ועידן הכל לבניין",
  baseUrl: BASE_URL,

  async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
    ctx.log("info", "homreybinyan: Shopify products feed (single page, ≤250)");
    return [{ key: "all", label: "הראל ועידן הכל לבניין — מוצרים", url: PRODUCTS_URL }];
  },

  async *scrapeCategory(category: CategoryRef, ctx: ScraperContext): AsyncIterable<RawProduct> {
    const json = await ctx.fetchText(category.url);
    const products = parseShopifyProducts(json, { baseUrl: BASE_URL });
    for (const product of products) {
      yield { ...product, region: ctx.region };
    }
  },
};
