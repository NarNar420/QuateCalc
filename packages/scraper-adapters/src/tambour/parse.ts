import type { CategoryRef, RawProduct } from "@quatecalc/contracts";
import * as cheerio from "cheerio";
import { TAMBOUR_SELECTORS } from "./selectors.js";

/** Resolve a possibly-relative href against the site base URL. */
function absoluteUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Derive a stable category key from a URL path (last path segment). */
function keyFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.split("/").filter(Boolean).pop() ?? path;
  } catch {
    return url;
  }
}

export interface TambourParseContext {
  baseUrl: string;
  categoryPath?: string[];
}

/** Parse the WooCommerce shop page's category tiles into CategoryRefs. */
export function parseCategoryList(html: string, ctx: TambourParseContext): CategoryRef[] {
  const $ = cheerio.load(html);
  const out: CategoryRef[] = [];
  const seen = new Set<string>();

  $(TAMBOUR_SELECTORS.categoryLink).each((_i, el) => {
    const $el = $(el);
    // WooCommerce category tiles wrap the label in a title child that also holds
    // a product-count badge like "(42)"; strip the badge and collapse whitespace.
    const $title = $el.find(".woocommerce-loop-category__title").first();
    const label = ($title.length ? $title.text() : $el.text())
      .replace(/\((\d[\d,]*)\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const url = absoluteUrl($el.attr("href"), ctx.baseUrl);
    if (!label || !url || seen.has(url)) return;
    seen.add(url);
    out.push({ key: keyFromUrl(url), label, url });
  });

  return out;
}

/**
 * Parse a WooCommerce product-listing page into RawProducts. Handles sale
 * prices (the current amount is the LAST `.amount`, since <ins> follows <del>).
 * Cards missing a name, price, or resolvable URL are skipped.
 */
export function parseProducts(html: string, ctx: TambourParseContext): RawProduct[] {
  const $ = cheerio.load(html);
  const out: RawProduct[] = [];

  $(TAMBOUR_SELECTORS.productCard).each((_i, el) => {
    const $card = $(el);
    const name = $card.find(TAMBOUR_SELECTORS.productName).first().text().trim();

    // Current price = last amount (regular price <del> precedes sale price <ins>).
    const $amounts = $card.find(TAMBOUR_SELECTORS.productPrice);
    const priceRaw = $amounts.last().text().trim() || $amounts.first().text().trim();

    const unitRaw = $card.find(TAMBOUR_SELECTORS.productUnit).first().text().trim() || undefined;
    const href = $card.find(TAMBOUR_SELECTORS.productLink).first().attr("href");
    const url = absoluteUrl(href, ctx.baseUrl);

    // SKU lives on the add-to-cart button data attribute in WooCommerce.
    const sku =
      $card.find(`[${TAMBOUR_SELECTORS.productSkuAttr}]`).first().attr(TAMBOUR_SELECTORS.productSkuAttr)?.trim() ||
      undefined;

    if (!name || !priceRaw || !url) return;

    out.push({ name, priceRaw, unitRaw, sku, url, categoryPath: ctx.categoryPath });
  });

  return out;
}

/** Return the absolute URL of the next listing page, or null on the last page. */
export function parseNextPageUrl(html: string, ctx: TambourParseContext): string | null {
  const $ = cheerio.load(html);
  const href = $(TAMBOUR_SELECTORS.nextPage).first().attr("href");
  return absoluteUrl(href, ctx.baseUrl);
}
