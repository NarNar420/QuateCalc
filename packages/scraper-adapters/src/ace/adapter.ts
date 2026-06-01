import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseNextPageUrl, parseProducts } from "./parse.js";

const BASE_URL = "https://www.ace.co.il";

/** Defensive cap so a broken "next page" link can't loop forever. */
const MAX_PAGES = 50;

/**
 * Seeded ACE departments (SEO-slug category pages). ACE exposes categories via
 * a mega-menu rather than a single index page, so they are seeded here. The
 * worker's --category flag (categoryFilter) narrows a run to one of these.
 * Full mega-menu discovery is future work.
 */
const CATEGORIES: CategoryRef[] = [
  {
    key: "tools-paint-affixing",
    label: "כלי עבודה, צבע ופרזול",
    url: `${BASE_URL}/tools-paint-affixing`,
  },
];

export const aceAdapter: ScraperAdapter = {
  supplierKey: "ace",
  supplierName: "אייס",
  baseUrl: BASE_URL,

  async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
    ctx.log("info", `ace: ${CATEGORIES.length} seeded categories`);
    return CATEGORIES;
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

  async *searchProducts(query: string, ctx: ScraperContext): AsyncIterable<RawProduct> {
    const url = `${BASE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;
    ctx.log("info", `ace: search "${query}"`);
    const html = await ctx.fetchText(url);
    const products = parseProducts(html, {
      baseUrl: BASE_URL,
      categoryPath: ["חיפוש"],
    });
    for (const product of products) {
      yield { ...product, region: ctx.region };
    }
  },
};
