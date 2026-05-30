import { type Quote, type ExportFormat } from "@quatecalc/contracts";
import { toCsv } from "./csv.js";
import { toXlsx } from "./xlsx.js";
import { formatDate } from "./table.js";

export interface ExportResult {
  filename: string;
  contentType: string;
  data: Buffer;
}

/**
 * Convenience dispatcher: export a {@link Quote} to the requested format and
 * return a `{ filename, contentType, data }` object ready to send as an HTTP
 * response or write to disk.
 */
export async function exportQuote(
  quote: Quote,
  format: ExportFormat,
): Promise<ExportResult> {
  const dateStr = formatDate(quote.createdAt);

  if (format === "csv") {
    const csv = toCsv(quote);
    return {
      filename: `quote-${dateStr}.csv`,
      contentType: "text/csv; charset=utf-8",
      data: Buffer.from(csv, "utf-8"),
    };
  }

  // xlsx
  const data = await toXlsx(quote);
  return {
    filename: `quote-${dateStr}.xlsx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data,
  };
}
