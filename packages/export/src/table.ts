import { type Quote, UNIT_LABELS_HE, REGION_LABELS_HE } from "@quatecalc/contracts";

/** Column headers for the quote table (Hebrew, RTL). */
export const TABLE_HEADERS: string[] = [
  "#",
  "תיאור",
  "כמות",
  "יחידה",
  "מחיר יחידה",
  'סה"כ שורה',
];

export interface QuoteTable {
  headers: string[];
  rows: (string | number)[][];
  totalsBlock: { label: string; value: number }[];
}

/**
 * Build a shared layout object (headers, data rows, totals block) from a
 * computed {@link Quote}. Both the CSV and XLSX renderers consume this.
 */
export function buildQuoteTable(quote: Quote): QuoteTable {
  const headers = TABLE_HEADERS;

  const rows: (string | number)[][] = quote.lines.map((line, idx) => [
    idx + 1,
    line.description,
    line.quantity,
    UNIT_LABELS_HE[line.unit],
    line.unitPrice,
    line.lineTotal,
  ]);

  const { totals, pricing } = quote;
  const vatPercent = pricing.vatPercent;

  const totalsBlock: { label: string; value: number }[] = [
    { label: 'סה"כ חומרים', value: totals.subtotal },
    { label: "הוצאות נוספות", value: totals.overheadTotal },
    { label: "רווח", value: totals.marginAmount },
    { label: 'סה"כ לפני מע"מ', value: totals.beforeVat },
    { label: `מע"מ ${vatPercent}%`, value: totals.vat },
    { label: 'סה"כ כולל מע"מ', value: totals.grandTotal },
  ];

  return { headers, rows, totalsBlock };
}

/** Format a Date to ISO date string (YYYY-MM-DD). */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Render a region label in Hebrew. */
export function regionLabel(quote: Quote): string {
  return REGION_LABELS_HE[quote.region];
}
