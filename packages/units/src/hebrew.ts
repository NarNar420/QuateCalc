/**
 * Shared Hebrew text normalization used by unit parsing and the matching engine.
 * Goal: collapse the many ways the same product/unit is written so fuzzy and
 * full-text search line up.
 */

// Hebrew niqqud (vowel points) and cantillation marks.
const NIQQUD = /[֑-ׇ]/g;

// Final-form letters -> base form, so "סוף" vs "סופ" don't differ.
const FINAL_FORMS: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

// Any kind of quote/gershayim/geresh used in abbreviations (מ"ר, יח').
const QUOTES = /["'`׳״‘’“”]/g;

/**
 * Normalize a Hebrew string for matching:
 * - strip niqqud
 * - remove quote/geresh characters
 * - fold final letters to base forms
 * - lowercase latin, collapse whitespace and most punctuation to single spaces
 */
export function normalizeHebrew(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKC");
  s = s.replace(NIQQUD, "");
  s = s.replace(QUOTES, "");
  s = s.toLowerCase();
  // turn separators/punctuation into spaces (keep letters, digits, dot for decimals)
  s = s.replace(/[^\p{L}\p{N}.]+/gu, " ");
  s = s.replace(/(.)/gu, (ch) => FINAL_FORMS[ch] ?? ch);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Tokenize a normalized Hebrew string into words (length >= 1). */
export function tokenizeHebrew(input: string): string[] {
  const norm = normalizeHebrew(input);
  return norm.length ? norm.split(" ") : [];
}
