import type { RawProduct } from "@quatecalc/contracts";
import * as cheerio from "cheerio";
import { WOO_SELECTORS } from "./selectors.js";

/** Resolve a possibly-relative (incl. protocol-relative) href against baseUrl. */
function absoluteUrl(href: string | undefined, baseUrl: string): string | null {
  // Reject empty/blank too: `new URL("", base)` resolves to base (a false positive).
  if (!href || !href.trim()) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Context the parsers need to build absolute URLs + category breadcrumbs. */
export interface WooParseContext {
  baseUrl: string;
  categoryPath?: string[];
}

/**
 * Parse a generic WooCommerce listing/category page into RawProducts.
 *
 * The CURRENT price is the `<ins>` amount when the product is on sale, otherwise
 * the first `.woocommerce-Price-amount` NOT inside a `<del>` (struck-through old
 * price). The amount element's text is taken directly so adjacent disclaimers
 * (e.g. WoodMart's "המחיר כולל מע\"מ") don't pollute the price.
 *
 * The title anchor is filtered to `/product/` URLs so that theme "subcategory
 * tiles" — which reuse the same title class but link to `/product-category/` —
 * are skipped. Cards missing a name, price, or resolvable product URL are
 * skipped (these are the fields the runner relies on).
 */
export function parseWooProducts(html: string, ctx: WooParseContext): RawProduct[] {
  const $ = cheerio.load(html);
  const out: RawProduct[] = [];

  $(WOO_SELECTORS.productCard).each((_i, el) => {
    const $card = $(el);

    // Name + URL: first title anchor whose href looks like a product page.
    const $link = $card
      .find(WOO_SELECTORS.titleLink)
      .filter((_, a) => ($(a).attr("href") ?? "").includes("/product/"))
      .first();

    const name = $link.text().replace(/\s+/g, " ").trim();
    const url = absoluteUrl($link.attr("href"), ctx.baseUrl);

    // Current price: prefer the <ins> amount (sale), else the first amount that
    // is NOT inside a <del> (struck-through old price).
    const $block = $card.find(WOO_SELECTORS.priceBlock).first();
    let $amount = $block
      .find(`${WOO_SELECTORS.priceIns} ${WOO_SELECTORS.priceAmount}`)
      .first();
    if ($amount.length === 0) {
      $amount = $block
        .find(WOO_SELECTORS.priceAmount)
        .filter((_, a) => $(a).closest(WOO_SELECTORS.priceDel).length === 0)
        .first();
    }
    const priceRaw = $amount.text().replace(/\s+/g, " ").trim();

    if (!name || !priceRaw || !url) return;

    out.push({ name, priceRaw, url, categoryPath: ctx.categoryPath });
  });

  return out;
}

/** Return the absolute URL of the next listing page, or null on the last page. */
export function parseWooNextPage(html: string, ctx: WooParseContext): string | null {
  const $ = cheerio.load(html);
  const href = $(WOO_SELECTORS.nextPage).first().attr("href");
  return absoluteUrl(href, ctx.baseUrl);
}
