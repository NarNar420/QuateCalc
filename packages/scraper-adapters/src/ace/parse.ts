import type { CategoryRef, RawProduct } from "@quatecalc/contracts";
import * as cheerio from "cheerio";
import { ACE_SELECTORS } from "./selectors.js";

/** Resolve a possibly-relative href against the site base URL. */
function absoluteUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Context the parsers need to build absolute URLs + category breadcrumbs. */
export interface AceParseContext {
  baseUrl: string;
  categoryPath?: string[];
}

/**
 * Parse the category navigation page into CategoryRefs. Links without a usable
 * href or label are skipped. URLs are absolutized against baseUrl.
 */
export function parseCategoryList(html: string, ctx: AceParseContext): CategoryRef[] {
  const $ = cheerio.load(html);
  const out: CategoryRef[] = [];
  const seen = new Set<string>();

  $(ACE_SELECTORS.categoryLink).each((_i, el) => {
    const $el = $(el);
    const label = $el.text().trim();
    const url = absoluteUrl($el.attr("href"), ctx.baseUrl);
    if (!label || !url || seen.has(url)) return;
    seen.add(url);
    // Derive a stable key from the URL path.
    let key: string;
    try {
      const path = new URL(url).pathname.replace(/\/+$/, "");
      key = path.split("/").filter(Boolean).pop() ?? path;
    } catch {
      key = url;
    }
    out.push({ key, label, url });
  });

  return out;
}

/**
 * Parse a product-listing page into RawProducts. Cards missing a name, price,
 * or resolvable URL are skipped (those are the fields the runner relies on).
 */
export function parseProducts(html: string, ctx: AceParseContext): RawProduct[] {
  const $ = cheerio.load(html);
  const out: RawProduct[] = [];

  $(ACE_SELECTORS.productCard).each((_i, el) => {
    const $card = $(el);
    const name = $card.find(ACE_SELECTORS.productName).first().text().trim();
    const priceRaw = $card.find(ACE_SELECTORS.productPrice).first().text().trim();
    const unitRaw = $card.find(ACE_SELECTORS.productUnit).first().text().trim() || undefined;
    const href = $card.find(ACE_SELECTORS.productLink).first().attr("href");
    const url = absoluteUrl(href, ctx.baseUrl);
    const sku = $card.attr(ACE_SELECTORS.productSkuAttr)?.trim() || undefined;

    if (!name || !priceRaw || !url) return;

    out.push({
      name,
      priceRaw,
      unitRaw,
      sku,
      url,
      categoryPath: ctx.categoryPath,
    });
  });

  return out;
}

/** Return the absolute URL of the next listing page, or null on the last page. */
export function parseNextPageUrl(html: string, ctx: AceParseContext): string | null {
  const $ = cheerio.load(html);
  const href = $(ACE_SELECTORS.nextPage).first().attr("href");
  return absoluteUrl(href, ctx.baseUrl);
}
