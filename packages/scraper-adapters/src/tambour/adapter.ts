import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseCategoryList, parseNextPageUrl, parseProducts } from "./parse.js";

const BASE_URL = "https://www.tambour.co.il";

/** WooCommerce shop landing page — category discovery starts here. */
const SHOP_URL = `${BASE_URL}/shop/`;

/** Defensive cap so a broken "next page" link can't loop forever. */
const MAX_PAGES = 50;

export const tambourAdapter: ScraperAdapter = {
  supplierKey: "tambour",
  supplierName: "טמבור",
  baseUrl: BASE_URL,

  async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
    const html = await ctx.fetchText(SHOP_URL);
    const categories = parseCategoryList(html, { baseUrl: BASE_URL });
    ctx.log("info", `tambour: discovered ${categories.length} categories`);
    return categories;
  },

  async *scrapeCategory(
    category: CategoryRef,
    ctx: ScraperContext,
  ): AsyncIterable<RawProduct> {
    let pageUrl: string | null = category.url;
    const visited = new Set<string>();

    for (let page = 0; page < MAX_PAGES && pageUrl; page++) {
      if (visited.has(pageUrl)) break; // guard against self-referential next links
      visited.add(pageUrl);

      const html = await ctx.fetchText(pageUrl);
      const products = parseProducts(html, {
        baseUrl: BASE_URL,
        categoryPath: [category.label],
      });

      if (products.length === 0) break; // pagination stop condition

      for (const product of products) {
        yield { ...product, region: ctx.region };
      }

      pageUrl = parseNextPageUrl(html, { baseUrl: BASE_URL });
    }
  },
};
