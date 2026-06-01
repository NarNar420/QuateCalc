import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseShopifyProducts, parseShopifySearch } from "./shopify.js";

const BASE_URL = "https://www.homecenter.co.il";
/** Shopify product feed, page 1. ?page= is robots-disallowed, so one page (max 250). */
const PRODUCTS_URL = `${BASE_URL}/products.json?limit=250`;

export const homecenterAdapter: ScraperAdapter = {
  supplierKey: "homecenter",
  supplierName: "הום סנטר",
  baseUrl: BASE_URL,

  async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
    ctx.log("info", "homecenter: Shopify products feed (single page, ≤250)");
    return [{ key: "all", label: "הום סנטר — מוצרים", url: PRODUCTS_URL }];
  },

  async *scrapeCategory(category: CategoryRef, ctx: ScraperContext): AsyncIterable<RawProduct> {
    const json = await ctx.fetchText(category.url);
    const products = parseShopifyProducts(json, { baseUrl: BASE_URL });
    for (const product of products) {
      yield { ...product, region: ctx.region };
    }
  },

  async *searchProducts(query: string, ctx: ScraperContext): AsyncIterable<RawProduct> {
    const url =
      `${BASE_URL}/search/suggest.json?q=${encodeURIComponent(query)}` +
      `&resources[type]=product&resources[limit]=10`;
    ctx.log("info", `homecenter: search "${query}"`);
    const json = await ctx.fetchText(url);
    for (const product of parseShopifySearch(json, { baseUrl: BASE_URL })) {
      yield { ...product, region: ctx.region };
    }
  },
};
