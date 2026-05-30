import type {
  CategoryRef,
  RawProduct,
  ScraperAdapter,
  ScraperContext,
} from "@quatecalc/contracts";
import { isProductUrl, parseProductJsonLd, parseSitemapLocs } from "./sitemap.js";

const BASE_URL = "https://www.ace.co.il";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

export interface AceSitemapOptions {
  /** Hard cap on products crawled (politeness; full catalog = tens of thousands). */
  maxProducts?: number;
}

/**
 * A sitemap-driven ACE adapter: discovers product URLs from the sitemap index
 * (bypassing the robots-blocked ?p= category pagination) and reads each product's
 * price from its schema.org Product JSON-LD. The JSON-LD is JS-injected, so this
 * adapter MUST run with the browser transport. Promotes into the ACE catalog
 * (supplierKey "ace") through the normal runner + health gate. Capped via
 * maxProducts; an uncapped run is a long batch.
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
      // 1. index -> child sitemaps -> product URLs (stop once we have enough).
      const indexXml = await ctx.fetchText(category.url);
      const childSitemaps = parseSitemapLocs(indexXml);
      const productUrls: string[] = [];
      for (const sm of childSitemaps) {
        if (productUrls.length >= maxProducts) break;
        let xml: string;
        try {
          xml = await ctx.fetchText(sm);
        } catch (err) {
          ctx.log("warn", `sitemap fetch failed: ${sm} (${String(err)})`);
          continue;
        }
        for (const u of parseSitemapLocs(xml)) {
          if (isProductUrl(u)) productUrls.push(u);
          if (productUrls.length >= maxProducts) break;
        }
      }
      ctx.log("info", `ace-sitemap: ${productUrls.length} product URLs to fetch`);

      // 2. fetch each product page (browser-rendered) and parse its JSON-LD.
      for (const url of productUrls) {
        let html: string;
        try {
          html = await ctx.fetchText(url);
        } catch (err) {
          ctx.log("warn", `product fetch failed: ${url} (${String(err)})`);
          continue;
        }
        const product = parseProductJsonLd(html, url);
        if (product) yield { ...product, region: ctx.region };
        else ctx.log("warn", `no Product JSON-LD: ${url}`);
      }
    },
  };
}
