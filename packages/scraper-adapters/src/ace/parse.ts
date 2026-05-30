import type { CategoryRef, RawProduct } from "@quatecalc/contracts";
import * as cheerio from "cheerio";
import { ACE_SELECTORS } from "./selectors.js";

/** Resolve a possibly-relative (incl. protocol-relative) href against baseUrl. */
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
 * Parse an ACE category listing page (Knockout-rendered DOM) into RawProducts.
 * The current price is the `.price` block that is NOT inside `.old-price`;
 * its `.priceNum` is shekels and an optional `.ag` sibling is agorot. Cards
 * missing a name, price, or resolvable URL are skipped (these are the fields
 * the runner relies on — also skips empty Knockout template placeholders).
 */
export function parseProducts(html: string, ctx: AceParseContext): RawProduct[] {
  const $ = cheerio.load(html);
  const out: RawProduct[] = [];

  $(ACE_SELECTORS.productCard).each((_i, el) => {
    const $card = $(el);
    const $link = $card.find(ACE_SELECTORS.productLink).first();

    const name = $link.text().replace(/\s+/g, " ").trim();
    const sku = $link.attr(ACE_SELECTORS.productSkuAttr)?.trim() || undefined;
    const url = absoluteUrl($link.attr("href"), ctx.baseUrl);

    // Current price = the .price not inside .old-price (handles sale + regular).
    const $cur = $card
      .find(ACE_SELECTORS.priceCurrent)
      .filter((_, e) => $(e).closest(ACE_SELECTORS.oldPrice).length === 0)
      .first();
    const num = $cur.find(ACE_SELECTORS.priceNum).first().text().trim();
    const ag = $cur.find(ACE_SELECTORS.priceAgorot).first().text().trim();
    const priceRaw = num ? `₪${num}${ag ? "." + ag : ""}` : "";

    if (!name || !priceRaw || !url) return;

    out.push({ name, priceRaw, sku, url, categoryPath: ctx.categoryPath });
  });

  return out;
}

/** Return the absolute URL of the next listing page, or null on the last page. */
export function parseNextPageUrl(html: string, ctx: AceParseContext): string | null {
  const $ = cheerio.load(html);
  const href = $(ACE_SELECTORS.nextPage).first().attr("href");
  return absoluteUrl(href, ctx.baseUrl);
}
