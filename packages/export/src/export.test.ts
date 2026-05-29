import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { type Quote } from "@quatecalc/contracts";
import { toCsv } from "./csv.js";
import { toXlsx } from "./xlsx.js";
import { exportQuote } from "./exportQuote.js";
import { buildQuoteTable } from "./table.js";

// ── Shared sample quote ───────────────────────────────────────────────────────

const sampleQuote: Quote = {
  id: "test-001",
  title: "שיפוץ מטבח",
  customerName: "דוד לוי",
  region: "center",
  currency: "ILS",
  createdAt: new Date("2026-05-29"),
  pricing: {
    overhead: { items: [] },
    marginPercent: 10,
    vatPercent: 18,
    currency: "ILS",
  },
  lines: [
    {
      description: "אריחי קרמיקה לרצפה",
      quantity: 25,
      unit: "square_meter",
      unitPrice: 120,
      lineTotal: 3000,
    },
    {
      // Description that includes a comma — tests CSV escaping
      description: "דבק פלייבנד, 25 ק\"ג לשק",
      quantity: 4,
      unit: "bag",
      unitPrice: 85,
      lineTotal: 340,
    },
    {
      description: "עבודת הנחה",
      quantity: 25,
      unit: "square_meter",
      unitPrice: 60,
      lineTotal: 1500,
    },
  ],
  totals: {
    subtotal: 4840,
    overheadTotal: 0,
    costBase: 4840,
    marginAmount: 484,
    beforeVat: 5324,
    vat: 958.32,
    grandTotal: 6282.32,
  },
};

// ── buildQuoteTable ───────────────────────────────────────────────────────────

describe("buildQuoteTable", () => {
  it("returns correct header count and values", () => {
    const { headers } = buildQuoteTable(sampleQuote);
    expect(headers).toHaveLength(6);
    expect(headers[0]).toBe("#");
    expect(headers[1]).toBe("תיאור");
    expect(headers[5]).toBe('סה"כ שורה');
  });

  it("maps units to Hebrew labels", () => {
    const { rows } = buildQuoteTable(sampleQuote);
    // First row: square_meter -> מ"ר
    expect(rows[0]?.[3]).toBe('מ"ר');
    // Second row: bag -> שק
    expect(rows[1]?.[3]).toBe("שק");
  });

  it("builds a totals block with 6 entries", () => {
    const { totalsBlock } = buildQuoteTable(sampleQuote);
    expect(totalsBlock).toHaveLength(6);
    // Last entry is grand total
    const last = totalsBlock[totalsBlock.length - 1];
    expect(last?.label).toBe('סה"כ כולל מע"מ');
    expect(last?.value).toBe(sampleQuote.totals.grandTotal);
  });

  it("labels the VAT entry with the configured percent", () => {
    const { totalsBlock } = buildQuoteTable(sampleQuote);
    const vatEntry = totalsBlock.find((e) => e.label.startsWith("מע\"מ"));
    expect(vatEntry?.label).toBe('מע"מ 18%');
  });
});

// ── toCsv ─────────────────────────────────────────────────────────────────────

describe("toCsv", () => {
  it("starts with UTF-8 BOM", () => {
    const csv = toCsv(sampleQuote);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("contains Hebrew column headers", () => {
    const csv = toCsv(sampleQuote);
    expect(csv).toContain("תיאור");
    expect(csv).toContain("כמות");
    expect(csv).toContain("יחידה");
    expect(csv).toContain("מחיר יחידה");
    // The header contains a " character so it gets CSV-quoted and the " is doubled
    expect(csv).toContain('"סה""כ שורה"');
  });

  it("contains a known line description", () => {
    const csv = toCsv(sampleQuote);
    expect(csv).toContain("אריחי קרמיקה לרצפה");
  });

  it("includes the grand total value", () => {
    const csv = toCsv(sampleQuote);
    expect(csv).toContain(String(sampleQuote.totals.grandTotal));
  });

  it("escapes a description that contains a comma", () => {
    const csv = toCsv(sampleQuote);
    // The comma-containing description must be wrapped in double-quotes
    expect(csv).toContain('"דבק פלייבנד, 25 ק""ג לשק"');
  });

  it("includes metadata: customer, region, date", () => {
    const csv = toCsv(sampleQuote);
    expect(csv).toContain("דוד לוי");
    expect(csv).toContain("מרכז"); // REGION_LABELS_HE['center']
    expect(csv).toContain("2026-05-29");
  });

  it("includes the quote title", () => {
    const csv = toCsv(sampleQuote);
    expect(csv).toContain("שיפוץ מטבח");
  });
});

// ── toXlsx ────────────────────────────────────────────────────────────────────

describe("toXlsx", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await toXlsx(sampleQuote);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("worksheet is right-to-left", async () => {
    const buf = await toXlsx(sampleQuote);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws).toBeDefined();
    const view = ws?.views?.[0];
    expect(view?.rightToLeft).toBe(true);
  });

  it("header row contains Hebrew column titles", async () => {
    const buf = await toXlsx(sampleQuote);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws).toBeDefined();

    // Find the header row by scanning for '#' in the first column
    let headerRow: ExcelJS.Row | undefined;
    ws?.eachRow((row) => {
      if (row.getCell(1).value === "#") {
        headerRow = row;
      }
    });

    expect(headerRow).toBeDefined();
    expect(headerRow?.getCell(2).value).toBe("תיאור");
    expect(headerRow?.getCell(4).value).toBe("יחידה");
    expect(headerRow?.getCell(6).value).toBe('סה"כ שורה');
  });

  it("grand total cell has the correct numeric value", async () => {
    const buf = await toXlsx(sampleQuote);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws).toBeDefined();

    // Find the grand-total row by scanning for the label in col 1
    let grandTotalValue: ExcelJS.CellValue | undefined;
    ws?.eachRow((row) => {
      const label = row.getCell(1).value;
      if (label === 'סה"כ כולל מע"מ') {
        grandTotalValue = row.getCell(2).value;
      }
    });

    expect(grandTotalValue).toBe(sampleQuote.totals.grandTotal);
  });
});

// ── exportQuote ───────────────────────────────────────────────────────────────

describe("exportQuote", () => {
  it("csv result has correct contentType and filename", async () => {
    const result = await exportQuote(sampleQuote, "csv");
    expect(result.contentType).toContain("text/csv");
    expect(result.filename).toMatch(/^quote-.*\.csv$/);
    expect(result.data).toBeInstanceOf(Buffer);
    // BOM is preserved in the returned Buffer
    expect(result.data.toString("utf-8").startsWith("﻿")).toBe(true);
  });

  it("xlsx result has correct contentType and filename", async () => {
    const result = await exportQuote(sampleQuote, "xlsx");
    expect(result.contentType).toContain("spreadsheetml");
    expect(result.filename).toMatch(/^quote-.*\.xlsx$/);
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.data.byteLength).toBeGreaterThan(0);
  });
});
