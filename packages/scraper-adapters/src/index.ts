import { registerAdapter } from "@quatecalc/scraper-core";
import { aceAdapter } from "./ace/adapter.js";
import { tambourAdapter } from "./tambour/adapter.js";
import { homecenterAdapter } from "./homecenter/adapter.js";
import { homreybinyanAdapter } from "./homreybinyan/adapter.js";
import { bniyahAdapter, sinaiAdapter, vakninAdapter } from "./woocommerce/adapter.js";

export { aceAdapter } from "./ace/adapter.js";
export {
  parseProducts,
  parseNextPageUrl,
  type AceParseContext,
} from "./ace/parse.js";
export { ACE_SELECTORS } from "./ace/selectors.js";

export { createAceSitemapAdapter } from "./ace/sitemapAdapter.js";
export type { AceSitemapOptions } from "./ace/sitemapAdapter.js";
export { parseSitemapLocs, isLeafCategoryUrl } from "./ace/sitemap.js";

export { tambourAdapter } from "./tambour/adapter.js";
export { TAMBOUR_SELECTORS } from "./tambour/selectors.js";
export type { TambourParseContext } from "./tambour/parse.js";

export { homecenterAdapter } from "./homecenter/adapter.js";
export { parseShopifyProducts } from "./homecenter/shopify.js";
export type { ShopifyParseContext } from "./homecenter/shopify.js";

export { homreybinyanAdapter } from "./homreybinyan/adapter.js";

export {
  createWooAdapter,
  vakninAdapter,
  bniyahAdapter,
  sinaiAdapter,
  type WooAdapterConfig,
} from "./woocommerce/adapter.js";
export {
  parseWooProducts,
  parseWooNextPage,
  type WooParseContext,
} from "./woocommerce/parse.js";
export { WOO_SELECTORS } from "./woocommerce/selectors.js";

/** Register the ACE adapter into the shared scraper-core registry. */
export function registerAceAdapter(): void {
  registerAdapter(aceAdapter);
}

/** Register the Tambour adapter into the shared scraper-core registry. */
export function registerTambourAdapter(): void {
  registerAdapter(tambourAdapter);
}

/** Register the Home Center adapter into the shared scraper-core registry. */
export function registerHomecenterAdapter(): void {
  registerAdapter(homecenterAdapter);
}

/** Register the Home Rey Binyan adapter into the shared scraper-core registry. */
export function registerHomreybinyanAdapter(): void {
  registerAdapter(homreybinyanAdapter);
}

/** Register the WooCommerce store adapters (Vaknin, Bniyah, Sinai). */
export function registerWooCommerceAdapters(): void {
  registerAdapter(vakninAdapter);
  registerAdapter(bniyahAdapter);
  registerAdapter(sinaiAdapter);
}

/** Register every available supplier adapter. */
export function registerAllAdapters(): void {
  registerAceAdapter();
  registerTambourAdapter();
  registerHomecenterAdapter();
  registerHomreybinyanAdapter();
  registerWooCommerceAdapters();
}
