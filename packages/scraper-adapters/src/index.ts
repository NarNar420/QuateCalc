import { registerAdapter } from "@quatecalc/scraper-core";
import { aceAdapter } from "./ace/adapter.js";

export { aceAdapter } from "./ace/adapter.js";
export {
  parseCategoryList,
  parseProducts,
  parseNextPageUrl,
  type AceParseContext,
} from "./ace/parse.js";
export { ACE_SELECTORS } from "./ace/selectors.js";

/** Register the ACE adapter into the shared scraper-core registry. */
export function registerAceAdapter(): void {
  registerAdapter(aceAdapter);
}
