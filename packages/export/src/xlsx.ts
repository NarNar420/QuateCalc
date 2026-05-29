import ExcelJS from "exceljs";
import { type Quote } from "@quatecalc/contracts";
import { buildQuoteTable, formatDate, regionLabel } from "./table.js";

/** Number format for ILS currency cells. */
const ILS_FORMAT = "₪#,##0.00";

/**
 * Convert a {@link Quote} to an XLSX buffer using ExcelJS.
 *
 * The worksheet is set to RTL mode. The header row is bold. Currency columns
 * (unit price, line total, and all totals-block values) are formatted with a
 * ₪ number format.
 */
export async function toXlsx(quote: Quote): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QuateCalc";
  workbook.created = quote.createdAt;

  const ws = workbook.addWorksheet("הצעת מחיר");

  // RTL worksheet
  ws.views = [{ rightToLeft: true }];

  const { headers, rows, totalsBlock } = buildQuoteTable(quote);

  // ── Metadata rows ─────────────────────────────────────────────────────────
  ws.addRow(["כותרת הצעת מחיר", quote.title ?? ""]);
  ws.addRow(["לקוח", quote.customerName ?? ""]);
  ws.addRow(["אזור", regionLabel(quote)]);
  ws.addRow(["תאריך", formatDate(quote.createdAt)]);
  ws.addRow([]); // blank row

  // ── Header row ────────────────────────────────────────────────────────────
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  // Column indices (1-based): #=1, desc=2, qty=3, unit=4, unitPrice=5, lineTotal=6
  const UNIT_PRICE_COL = 5;
  const LINE_TOTAL_COL = 6;

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (const row of rows) {
    const dataRow = ws.addRow(row);
    // Apply ₪ format to unit price and line total columns
    const upCell = dataRow.getCell(UNIT_PRICE_COL);
    const ltCell = dataRow.getCell(LINE_TOTAL_COL);
    upCell.numFmt = ILS_FORMAT;
    ltCell.numFmt = ILS_FORMAT;
  }

  ws.addRow([]); // blank separator

  // ── Totals block ──────────────────────────────────────────────────────────
  for (const { label, value } of totalsBlock) {
    const totRow = ws.addRow([label, value]);
    const valCell = totRow.getCell(2);
    valCell.numFmt = ILS_FORMAT;
  }

  // Auto-fit column widths (approximate)
  ws.columns.forEach((col) => {
    if (col && col.values) {
      let maxLen = 10;
      col.values.forEach((v) => {
        if (v !== null && v !== undefined) {
          maxLen = Math.max(maxLen, String(v).length + 2);
        }
      });
      col.width = maxLen;
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  // ExcelJS returns Buffer | ArrayBuffer depending on environment; coerce to Buffer.
  return Buffer.from(buffer);
}
