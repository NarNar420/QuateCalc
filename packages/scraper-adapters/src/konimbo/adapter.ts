import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseKonimboNextPage, parseKonimboProducts } from "./parse.js";

/** Defensive cap so a broken/self-referential "next page" link can't loop forever. */
const MAX_PAGES = 60;

/** Configuration for one concrete Konimbo shop served by the generic adapter. */
export interface KonimboAdapterConfig {
  /** Stable supplier key, e.g. "dhouse". */
  supplierKey: string;
  /** Display name (Hebrew ok). */
  supplierName: string;
  /** Site root, used for robots.txt resolution and URL joining. */
  baseUrl: string;
  /** Seeded categories/listings to crawl (numeric-id slugs discovered per shop). */
  categories: CategoryRef[];
}

/**
 * Build a {@link ScraperAdapter} for a Konimbo shop. The parser is theme-tolerant
 * (see ./selectors.ts), so a single factory serves multiple shops; only the base
 * URL and seeded category slugs differ. Pagination follows the Konimbo
 * `<link rel="next">` URL, capped and guarded against self-referential links like
 * the WooCommerce/ACE adapters.
 */
export function createKonimboAdapter(config: KonimboAdapterConfig): ScraperAdapter {
  const { supplierKey, supplierName, baseUrl, categories } = config;

  return {
    supplierKey,
    supplierName,
    baseUrl,

    async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
      ctx.log("info", `${supplierKey}: ${categories.length} seeded categories`);
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
        const products = parseKonimboProducts(html, {
          baseUrl,
          categoryPath: [category.label],
        });

        if (products.length === 0) break; // pagination stop condition

        for (const product of products) {
          yield { ...product, region: ctx.region };
        }

        const next = parseKonimboNextPage(html, { baseUrl });
        pageUrl = next && !visited.has(next) ? next : null;
      }
    },
  };
}

/** D-House / דוקטור האוס — d-house.co.il (Konimbo, ~450 products). */
export const dhouseAdapter: ScraperAdapter = createKonimboAdapter({
  supplierKey: "dhouse",
  supplierName: "דוקטור האוס",
  baseUrl: "https://www.d-house.co.il",
  categories: [
    {
      key: "work-tools",
      label: "כלי עבודה",
      url: "https://www.d-house.co.il/349794-%D7%9B%D7%9C%D7%99-%D7%A2%D7%91%D7%95%D7%93%D7%94",
    },
    {
      key: "electrical",
      label: "חשמל",
      url: "https://www.d-house.co.il/420409-%D7%97%D7%A9%D7%9E%D7%9C",
    },
  ],
});

/** Netanel Tools / נתנאל לבניין — netaneltools.co.il (Konimbo, ~1,478 products). */
export const netanelAdapter: ScraperAdapter = createKonimboAdapter({
  supplierKey: "netanel",
  supplierName: "נתנאל לבניין",
  baseUrl: "https://www.netaneltools.co.il",
  categories: [
    {
      key: "paint",
      label: "צבע",
      url: "https://www.netaneltools.co.il/349438-%D7%A6%D7%91%D7%A2",
    },
    {
      key: "power-tools",
      label: "כלים חשמליים",
      url: "https://www.netaneltools.co.il/349845-%D7%9B%D7%9C%D7%99%D7%9D-%D7%97%D7%A8%D7%A9%D7%9E%D7%9C%D7%99%D7%99%D7%9D",
    },
    {
      key: "work-tools",
      label: "כלי עבודה",
      url: "https://www.netaneltools.co.il/422654-%D7%9B%D7%9C%D7%99-%D7%A2%D7%91%D7%95%D7%93%D7%94",
    },
  ],
});
