import type { RawProduct } from "@quatecalc/contracts";
import * as cheerio from "cheerio";
import { KONIMBO_SELECTORS } from "./selectors.js";

/** Resolve a possibly-relative href against baseUrl. Konimbo hrefs carry leading
 * whitespace and a trailing newline (`'  /items/...\n'`) so we trim first. */
function absoluteUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href || !href.trim()) return null;
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

/** Context the parsers need to build absolute URLs + category breadcrumbs. */
export interface KonimboParseContext {
  baseUrl: string;
  categoryPath?: string[];
}

/**
 * Parse a Konimbo category/listing page into RawProducts.
 *
 * Each card (`.layout_list_item.item`) repeats the product link in several
 * anchors (image, title, price); we take the first anchor whose href points at
 * a `/items/` product page. The name comes from `.title`. The CURRENT price is
 * the `.price` element's own text AFTER removing the hidden "מחיר" label and the
 * struck-through `.origin_price` old price, leaving e.g. `89 ₪`. Cards missing a
 * name, price, or resolvable product URL are skipped (these are the fields the
 * runner relies on).
 */
export function parseKonimboProducts(html: string, ctx: KonimboParseContext): RawProduct[] {
  const $ = cheerio.load(html);
  const out: RawProduct[] = [];

  $(KONIMBO_SELECTORS.productCard).each((_i, el) => {
    const $card = $(el);

    // URL: first anchor whose href looks like a product page.
    const $link = $card
      .find(KONIMBO_SELECTORS.productLink)
      .filter((_, a) => ($(a).attr("href") ?? "").includes("/items/"))
      .first();
    const url = absoluteUrl($link.attr("href"), ctx.baseUrl);

    // Name: the .title element's text.
    const name = $card.find(KONIMBO_SELECTORS.title).first().text().replace(/\s+/g, " ").trim();

    // Price: clone the .price element, strip the hidden "מחיר" label and any
    // struck-through origin price, then read the remaining text (e.g. "89 ₪").
    const $price = $card.find(KONIMBO_SELECTORS.price).first().clone();
    $price.find(KONIMBO_SELECTORS.priceLabel).remove();
    $price.find(KONIMBO_SELECTORS.originPrice).remove();
    const priceRaw = $price.text().replace(/\s+/g, " ").trim();

    if (!name || !priceRaw || !url) return;

    out.push({ name, priceRaw, url, categoryPath: ctx.categoryPath });
  });

  return out;
}

/** Return the absolute URL of the next listing page, or null on the last page. */
export function parseKonimboNextPage(html: string, ctx: KonimboParseContext): string | null {
  const $ = cheerio.load(html);
  const href = $(KONIMBO_SELECTORS.nextPage).first().attr("href");
  return absoluteUrl(href, ctx.baseUrl);
}
