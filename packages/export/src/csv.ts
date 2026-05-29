import { type Quote } from "@quatecalc/contracts";
import { buildQuoteTable, formatDate, regionLabel } from "./table.js";

/** UTF-8 BOM so Excel opens Hebrew CSV files correctly. */
const BOM = "﻿";

/**
 * Escape a single CSV field value:
 * - If the value contains a comma, double-quote, or newline it is wrapped in
 *   double-quotes and any internal double-quotes are doubled.
 */
function escapeCsvField(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Render a single CSV row from an array of values. */
function csvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Convert a {@link Quote} to a UTF-8 CSV string with a leading BOM so that
 * Excel (Hebrew locale) opens it correctly. Includes:
 *   1. A title/metadata block (quote title, customer, region, date).
 *   2. The line-item table.
 *   3. The totals block.
 */
export function toCsv(quote: Quote): string {
  const { headers, rows, totalsBlock } = buildQuoteTable(quote);

  const lines: string[] = [];

  // ── Title / metadata block ──────────────────────────────────────────────
  lines.push(csvRow(["כותרת הצעת מחיר", quote.title ?? ""]));
  lines.push(csvRow(["לקוח", quote.customerName ?? ""]));
  lines.push(csvRow(["אזור", regionLabel(quote)]));
  lines.push(csvRow(["תאריך", formatDate(quote.createdAt)]));
  lines.push(""); // blank separator

  // ── Header row ──────────────────────────────────────────────────────────
  lines.push(csvRow(headers));

  // ── Data rows ────────────────────────────────────────────────────────────
  for (const row of rows) {
    lines.push(csvRow(row));
  }

  lines.push(""); // blank separator

  // ── Totals block ─────────────────────────────────────────────────────────
  for (const { label, value } of totalsBlock) {
    lines.push(csvRow([label, value]));
  }

  return BOM + lines.join("\n");
}
