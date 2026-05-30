"use client";

import {
  type CatalogProduct,
  type MatchStatus,
  type Region,
  UNIT_LABELS_HE,
} from "@quatecalc/contracts";
import { useState } from "react";
import type { PricedLine } from "../types";

const STATUS_LABEL: Record<MatchStatus, string> = {
  confident: "התאמה ודאית",
  needs_review: "לבדיקה",
  no_match: "לא נמצא",
};

function fmt(n: number): string {
  return n.toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

/** A row is "ready" if it has a product, or a manual price + description. */
function isRowReady(line: PricedLine): boolean {
  if (line.selectedProduct) return true;
  return line.unitPrice > 0 && line.description.trim().length > 0;
}

export function ReviewStep({
  region,
  pricedLines,
  onChange,
  onBack,
  onNext,
}: {
  region: Region;
  pricedLines: PricedLine[];
  onChange: (lines: PricedLine[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [openSearch, setOpenSearch] = useState<string | null>(null);

  function update(id: string, patch: Partial<PricedLine>) {
    onChange(pricedLines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  const allReady = pricedLines.every(isRowReady);

  return (
    <section className="card">
      <h2>2. סקירת התאמות</h2>
      <p className="hint">
        בדקו את ההתאמות. ניתן לחפש מוצר חלופי, לערוך כמות, או להזין מחיר ידני.
        שורות שלא נמצאו דורשות בחירת מוצר או מחיר ידני לפני המשך.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>חומר (טקסט מקורי)</th>
            <th>סטטוס</th>
            <th>מוצר מותאם</th>
            <th>כמות</th>
            <th>יחידה</th>
            <th>מחיר ליח'</th>
            <th>סה"כ שורה</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pricedLines.map((line) => {
            const lineTotal = line.quantity * line.unitPrice;
            const ready = isRowReady(line);
            return (
              <tr
                key={line.id}
                style={!ready ? { background: "var(--red-bg)" } : undefined}
              >
                <td>
                  {line.rawText}
                  <div className="muted" style={{ fontSize: 12 }}>
                    בקשה: {fmt(line.requestedQuantity)}
                    {line.rawUnit ? ` ${line.rawUnit}` : ""}
                  </div>
                </td>
                <td>
                  <span className={`badge ${line.status}`}>
                    {STATUS_LABEL[line.status]}
                  </span>
                </td>
                <td>
                  {line.selectedProduct ? (
                    line.selectedProduct.name
                  ) : (
                    <input
                      type="text"
                      value={line.description}
                      placeholder="תיאור ידני"
                      onChange={(e) =>
                        update(line.id, { description: e.target.value })
                      }
                    />
                  )}
                  <div>
                    <button
                      type="button"
                      className="btn ghost small"
                      style={{ marginTop: 6 }}
                      onClick={() =>
                        setOpenSearch(openSearch === line.id ? null : line.id)
                      }
                    >
                      {openSearch === line.id ? "סגור חיפוש" : "חיפוש מוצר"}
                    </button>
                  </div>
                  {openSearch === line.id && (
                    <ProductSearch
                      region={region}
                      onPick={(p) => {
                        update(line.id, {
                          selectedProduct: p,
                          status: "confident",
                          description: p.name,
                          unit: p.unit,
                          unitPrice: p.price,
                        });
                        setOpenSearch(null);
                        // Learn the correction (best-effort).
                        void fetch("/api/overrides", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            rawText: line.rawText,
                            productId: p.id,
                          }),
                        }).catch(() => undefined);
                      }}
                    />
                  )}
                </td>
                <td>
                  <input
                    className="row-input num"
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) =>
                      update(line.id, {
                        quantity: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td>{UNIT_LABELS_HE[line.unit]}</td>
                <td>
                  <input
                    className="row-input num"
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitPrice}
                    onChange={(e) =>
                      update(line.id, {
                        unitPrice: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </td>
                <td className="num">₪ {fmt(lineTotal)}</td>
                <td></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="actions" style={{ marginTop: 20 }}>
        <button type="button" className="btn ghost" onClick={onBack}>
          → חזרה
        </button>
        <button
          type="button"
          className="btn"
          onClick={onNext}
          disabled={!allReady || pricedLines.length === 0}
        >
          המשך להוצאות →
        </button>
      </div>
      {!allReady && (
        <p className="hint" style={{ color: "var(--red)" }}>
          יש שורות ללא מוצר מותאם או מחיר ידני. השלימו אותן כדי להמשיך.
        </p>
      )}
    </section>
  );
}

function ProductSearch({
  region,
  onPick,
}: {
  region: Region;
  onPick: (p: CatalogProduct) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/catalog/search?q=${encodeURIComponent(q)}&region=${region}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "החיפוש נכשל.");
      }
      const data: { products: CatalogProduct[] } = await res.json();
      setResults(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "החיפוש נכשל.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="search-box">
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={q}
          placeholder="חיפוש מוצר בקטלוג..."
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="btn small"
          onClick={() => void search()}
          disabled={loading || !q.trim()}
        >
          {loading ? "..." : "חפש"}
        </button>
      </div>
      {error && (
        <p className="hint" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => onPick(p)}
              >
                ₪ {fmt(p.price)} · {UNIT_LABELS_HE[p.unit]} · בחר
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && results.length === 0 && q.trim() !== "" && (
        <p className="hint">לא נמצאו תוצאות. נסו ניסוח אחר או הזינו מחיר ידני.</p>
      )}
    </div>
  );
}
