"use client";

import {
  type ExportFormat,
  type Quote,
  type QuoteInput,
  type Region,
  UNIT_LABELS_HE,
} from "@quatecalc/contracts";
import { useEffect, useState } from "react";
import type { ConfigState, PricedLine } from "../types";

function fmt(n: number): string {
  return n.toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildInput(
  region: Region,
  pricedLines: PricedLine[],
  config: ConfigState,
): QuoteInput {
  return {
    region,
    lines: pricedLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
    })),
    pricing: {
      overhead: { items: config.overhead },
      marginPercent: config.marginPercent,
      vatPercent: config.vatPercent,
      currency: "ILS",
    },
  };
}

export function QuoteStep({
  region,
  pricedLines,
  config,
  onBack,
}: {
  region: Region;
  pricedLines: PricedLine[];
  config: ConfigState;
  onBack: () => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildInput(region, pricedLines, config)),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "חישוב הצעת המחיר נכשל.");
        }
        return res.json();
      })
      .then((data: Quote) => {
        if (!cancelled) setQuote(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "חישוב נכשל.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [region, pricedLines, config]);

  async function download(format: ExportFormat) {
    if (!quote) return;
    setDownloading(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, format }),
      });
      if (!res.ok) throw new Error("הייצוא נכשל.");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `quote.${format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הייצוא נכשל.");
    } finally {
      setDownloading(null);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <h2>4. הצעת מחיר</h2>
        <p className="muted">מחשב הצעת מחיר...</p>
      </section>
    );
  }

  if (error || !quote) {
    return (
      <section className="card">
        <h2>4. הצעת מחיר</h2>
        <div className="error">{error ?? "אירעה שגיאה."}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            → חזרה
          </button>
        </div>
      </section>
    );
  }

  const t = quote.totals;

  return (
    <section className="card">
      <h2>4. הצעת מחיר</h2>
      <div className="quote-layout">
        <div>
          <table className="table">
            <thead>
              <tr>
                <th>תיאור</th>
                <th>כמות</th>
                <th>יחידה</th>
                <th>מחיר ליח'</th>
                <th>סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.description}</td>
                  <td className="num">{fmt(line.quantity)}</td>
                  <td>{UNIT_LABELS_HE[line.unit]}</td>
                  <td className="num">₪ {fmt(line.unitPrice)}</td>
                  <td className="num">₪ {fmt(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="download-buttons">
            <button
              type="button"
              className="btn"
              onClick={() => void download("xlsx")}
              disabled={downloading !== null}
            >
              {downloading === "xlsx" ? <span className="spinner" /> : null}
              הורד Excel
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void download("csv")}
              disabled={downloading !== null}
            >
              {downloading === "csv" ? "..." : "הורד CSV"}
            </button>
          </div>
        </div>

        <aside className="card sticky-card">
          <div className="totals">
            <div className="totals-row">
              <span className="label">סה"כ חומרים</span>
              <span className="num">₪ {fmt(t.subtotal)}</span>
            </div>
            {quote.pricing.overhead.items.map((o, i) => (
              <div className="totals-row" key={i}>
                <span className="label">
                  {o.label}
                  {o.kind === "percent" ? ` (${fmt(o.value)}%)` : ""}
                </span>
                <span className="num muted">
                  {o.kind === "fixed" ? `₪ ${fmt(o.value)}` : ""}
                </span>
              </div>
            ))}
            <div className="totals-row">
              <span className="label">סה"כ הוצאות</span>
              <span className="num">₪ {fmt(t.overheadTotal)}</span>
            </div>
            <div className="totals-row divider">
              <span className="label">בסיס עלות</span>
              <span className="num">₪ {fmt(t.costBase)}</span>
            </div>
            <div className="totals-row">
              <span className="label">
                רווח ({fmt(quote.pricing.marginPercent)}%)
              </span>
              <span className="num">₪ {fmt(t.marginAmount)}</span>
            </div>
            <div className="totals-row">
              <span className="label">לפני מע"מ</span>
              <span className="num">₪ {fmt(t.beforeVat)}</span>
            </div>
            <div className="totals-row">
              <span className="label">
                מע"מ {fmt(quote.pricing.vatPercent)}%
              </span>
              <span className="num">₪ {fmt(t.vat)}</span>
            </div>
            <div className="totals-row grand">
              <span className="label">סה"כ כולל מע"מ</span>
              <span className="num">₪ {fmt(t.grandTotal)}</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="actions" style={{ marginTop: 20 }}>
        <button type="button" className="btn ghost" onClick={onBack}>
          → חזרה
        </button>
      </div>
    </section>
  );
}
