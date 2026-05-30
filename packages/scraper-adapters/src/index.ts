import { registerAdapter } from "@quatecalc/scraper-core";
import { aceAdapter } from "./ace/adapter.js";
import { tambourAdapter } from "./tambour/adapter.js";

export { aceAdapter } from "./ace/adapter.js";
export {
  parseProducts,
  parseNextPageUrl,
  type AceParseContext,
} from "./ace/parse.js";
export { ACE_SELECTORS } from "./ace/selectors.js";

export { createAceSitemapAdapter } from "./ace/sitemapAdapter.js";
export type { AceSitemapOptions } from "./ace/sitemapAdapter.js";
export { parseSitemapLocs, isProductUrl, parseProductJsonLd } from "./ace/sitemap.js";

export { tambourAdapter } from "./tambour/adapter.js";
export { TAMBOUR_SELECTORS } from "./tambour/selectors.js";
export type { TambourParseContext } from "./tambour/parse.js";

/** Register the ACE adapter into the shared scraper-core registry. */
export function registerAceAdapter(): void {
  registerAdapter(aceAdapter);
}

/** Register the Tambour adapter into the shared scraper-core registry. */
export function registerTambourAdapter(): void {
  registerAdapter(tambourAdapter);
}

/** Register every available supplier adapter. */
export function registerAllAdapters(): void {
  registerAceAdapter();
  registerTambourAdapter();
}
