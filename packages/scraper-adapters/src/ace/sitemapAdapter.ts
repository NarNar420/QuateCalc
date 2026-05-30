import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { parseProducts } from "./parse.js";
import { isLeafCategoryUrl, parseSitemapLocs } from "./sitemap.js";

const BASE_URL = "https://www.ace.co.il";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
/** Cap on how many leaf-category URLs we collect before scraping (bounds sitemap fetches). */
const MAX_LEAF_CATEGORIES = 40;

export interface AceSitemapOptions {
  /** Hard cap on products yielded (politeness; the full catalog is tens of thousands). */
  maxProducts?: number;
}

/**
 * Sitemap-driven ACE adapter: discovers leaf-category listing URLs from the
 * sitemap index (bypassing the robots-blocked ?p= pagination of any single
 * category) and scrapes each as a Magento listing via the shared `parseProducts`.
 * Reaches products across many categories. MUST run with the browser transport
 * (listing prices are Knockout-rendered). Promotes into the ACE catalog
 * (supplierKey "ace") through the runner + health gate. Capped via maxProducts.
 */
export function createAceSitemapAdapter(opts: AceSitemapOptions = {}): ScraperAdapter {
  const maxProducts = opts.maxProducts ?? 50;
  return {
    supplierKey: "ace",
    supplierName: "אייס",
    baseUrl: BASE_URL,

    async listCategories(ctx: ScraperContext): Promise<CategoryRef[]> {
      ctx.log("info", `ace-sitemap: crawl up to ${maxProducts} products`);
      return [{ key: "sitemap", label: "ACE (sitemap)", url: SITEMAP_URL }];
    },

    async *scrapeCategory(category: CategoryRef, ctx: ScraperContext): AsyncIterable<RawProduct> {
      // 1. index -> child sitemaps -> leaf-category URLs (bounded).
      const indexXml = await ctx.fetchText(category.url);
      const childSitemaps = parseSitemapLocs(indexXml);
      const leafCategories: string[] = [];
      for (const sm of childSitemaps) {
        if (leafCategories.length >= MAX_LEAF_CATEGORIES) break;
        let xml: string;
        try {
          xml = await ctx.fetchText(sm);
        } catch (err) {
          ctx.log("warn", `sitemap fetch failed: ${sm} (${String(err)})`);
          continue;
        }
        for (const u of parseSitemapLocs(xml)) {
          if (isLeafCategoryUrl(u)) leafCategories.push(u);
          if (leafCategories.length >= MAX_LEAF_CATEGORIES) break;
        }
      }
      ctx.log("info", `ace-sitemap: ${leafCategories.length} leaf categories discovered`);

      // 2. scrape each leaf category as a listing until we hit maxProducts.
      let yielded = 0;
      for (const catUrl of leafCategories) {
        if (yielded >= maxProducts) break;
        let html: string;
        try {
          html = await ctx.fetchText(catUrl);
        } catch (err) {
          ctx.log("warn", `category fetch failed: ${catUrl} (${String(err)})`);
          continue;
        }
        const products = parseProducts(html, { baseUrl: BASE_URL, categoryPath: [catUrl] });
        for (const p of products) {
          if (yielded >= maxProducts) break;
          yield { ...p, region: ctx.region };
          yielded++;
        }
      }
    },
  };
}
