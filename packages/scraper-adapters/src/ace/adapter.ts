import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseCategoryList, parseNextPageUrl, parseProducts } from "./parse.js";

const BASE_URL = "https://www.ace.co.il";

/** Where the adapter starts category discovery from. */
const CATEGORIES_URL = `${BASE_URL}/categories`;

/** Defensive cap so a broken "next page" link can't loop forever. */
const MAX_PAGES = 50;

export const aceAdapter: ScraperAdapter = {
  supplierKey: "ace",
  supplierName: "אייס",
  baseUrl: BASE_URL,

  async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
    const html = await ctx.fetchText(CATEGORIES_URL);
    const categories = parseCategoryList(html, { baseUrl: BASE_URL });
    ctx.log("info", `ace: discovered ${categories.length} categories`);
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

      // Pagination stop condition: no products on the page => done.
      if (products.length === 0) break;

      for (const product of products) {
        yield { ...product, region: ctx.region };
      }

      pageUrl = parseNextPageUrl(html, { baseUrl: BASE_URL });
    }
  },
};
