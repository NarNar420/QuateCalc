import type { Unit } from "@quatecalc/contracts";
import { normalizeHebrew } from "./hebrew.js";

/**
 * Map of normalized Hebrew/Latin unit aliases -> canonical Unit.
 * Keys are passed through normalizeHebrew (so no quotes/finals) before lookup.
 */
const UNIT_ALIASES: Record<string, Unit> = {};

function alias(unit: Unit, ...aliases: string[]): void {
  for (const a of aliases) {
    UNIT_ALIASES[normalizeHebrew(a)] = unit;
  }
}

alias("piece", "יח", "יח'", "יחידה", "יחידות", 'יח"', "pcs", "pc", "unit", "units", "כל");
alias("meter", "מ", "מטר", "מטרים", 'מ"א', "מא", "מטר אורך", "m", "meter");
alias("square_meter", 'מ"ר', "מר", "מטר מרובע", "מטר רבוע", "m2", "sqm", "sq m");
alias("cubic_meter", 'מ"ק', "מק", "קוב", "מטר מעוקב", "m3", "cbm");
alias("kilogram", 'ק"ג', "קג", "קילו", "קילוגרם", "kg", "kgs");
alias("ton", "טון", "טונה", "ton", "tonne", "t");
alias("liter", "ליטר", "ליטרים", "ל", "lit", "l", "liter", "litre");
alias("bag", "שק", "שקים", "שקית", "bag", "sack");
alias("roll", "גליל", "גלילים", "רול", "roll");
alias("sheet", "לוח", "לוחות", "יריעה", "יריעות", "פלטה", "sheet", "panel");
alias("pack", "אריזה", "מארז", "חבילה", "מארזים", "pack", "package", "set", "סט");

/**
 * Parse a free-text unit string into a canonical Unit.
 * Returns null if it can't be confidently mapped.
 */
export function normalizeUnit(raw: string | undefined | null): Unit | null {
  if (!raw) return null;
  const key = normalizeHebrew(raw);
  if (!key) return null;
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  // try the last token (e.g. "10 שק" -> "שק")
  const tokens = key.split(" ");
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t && UNIT_ALIASES[t]) return UNIT_ALIASES[t];
  }
  return null;
}
