import type {
  CatalogProduct,
  MatchedLineItem,
  OverheadItem,
  Region,
  Unit,
} from "@quatecalc/contracts";

/**
 * A priced line being assembled in the Review step. It carries enough info to
 * (a) render the review table and (b) be turned into a QuoteInput line.
 */
export interface PricedLine {
  /** Stable id, taken from the source MaterialLine. */
  id: string;
  /** Original free-text the user typed. */
  rawText: string;
  rawUnit?: string;
  /** Requested quantity as parsed from input. */
  requestedQuantity: number;
  /** The currently selected catalog product, if any. */
  selectedProduct: CatalogProduct | null;
  /** Match status from the engine (or "no_match" once cleared). */
  status: MatchedLineItem["status"];
  /** Description used in the quote (product name or manual text). */
  description: string;
  /** Quantity used for the line total. */
  quantity: number;
  /** Unit used for the quote line. */
  unit: Unit;
  /** Per-unit price (product price or manual override). */
  unitPrice: number;
}

export interface ConfigState {
  overhead: OverheadItem[];
  marginPercent: number;
  vatPercent: number;
}

export interface WizardState {
  region: Region;
  pricedLines: PricedLine[];
  config: ConfigState;
}
