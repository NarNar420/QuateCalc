import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseWooNextPage, parseWooProducts } from "./parse.js";

/** Defensive cap so a broken/self-referential "next page" link can't loop forever. */
const MAX_PAGES = 50;

/** Configuration for one concrete WooCommerce shop served by the generic adapter. */
export interface WooAdapterConfig {
  /** Stable supplier key, e.g. "vaknin". */
  supplierKey: string;
  /** Display name (Hebrew ok). */
  supplierName: string;
  /** Site root, used for robots.txt resolution and URL joining. */
  baseUrl: string;
  /** Seeded categories/listings to crawl (slugs discovered per shop). */
  categories: CategoryRef[];
}

/**
 * Build a {@link ScraperAdapter} for a WooCommerce shop. The parser is theme-
 * tolerant (see ./selectors.ts), so a single factory serves multiple shops;
 * only the base URL and seeded category slugs differ. Pagination follows the
 * standard WooCommerce `a.next.page-numbers` link, capped and guarded against
 * self-referential links like the ACE adapter.
 */
export function createWooAdapter(config: WooAdapterConfig): ScraperAdapter {
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
        const products = parseWooProducts(html, {
          baseUrl,
          categoryPath: [category.label],
        });

        if (products.length === 0) break; // pagination stop condition

        for (const product of products) {
          yield { ...product, region: ctx.region };
        }

        pageUrl = parseWooNextPage(html, { baseUrl });
      }
    },
  };
}

/** Vaknin Pro — vakninpro.co.il (custom WooCommerce theme). */
export const vakninAdapter: ScraperAdapter = createWooAdapter({
  supplierKey: "vaknin",
  supplierName: "וקנין פרו",
  baseUrl: "https://www.vakninpro.co.il",
  categories: [
    {
      key: "shop",
      label: "וקנין פרו — חנות",
      url: "https://www.vakninpro.co.il/shop/",
    },
    {
      key: "tools",
      label: "כלי עבודה",
      url: "https://www.vakninpro.co.il/product-category/%d7%9b%d7%9c%d7%99-%d7%a2%d7%91%d7%95%d7%93%d7%94/",
    },
  ],
});

/** Bniyah — bniyah.co.il (WoodMart WooCommerce theme). */
export const bniyahAdapter: ScraperAdapter = createWooAdapter({
  supplierKey: "bniyah",
  supplierName: "בנייה",
  baseUrl: "https://www.bniyah.co.il",
  categories: [
    {
      key: "shop",
      label: "בנייה — חנות",
      url: "https://www.bniyah.co.il/shop/",
    },
  ],
});

/** Sinai Store — sinaistore.com (Impreza/USES WooCommerce theme; has no /shop/, uses categories). */
export const sinaiAdapter: ScraperAdapter = createWooAdapter({
  supplierKey: "sinai",
  supplierName: "סיני סטור",
  baseUrl: "https://www.sinaistore.com",
  categories: [
    {
      key: "power-tools",
      label: "כלי עבודה חשמליים",
      url: "https://www.sinaistore.com/product-category/%d7%9b%d7%9c%d7%99-%d7%a2%d7%91%d7%95%d7%93%d7%94-%d7%97%d7%a9%d7%9e%d7%9c%d7%99%d7%99%d7%9d/",
    },
  ],
});
