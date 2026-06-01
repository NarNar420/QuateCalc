"use client";

import {
  DEFAULT_UNIT,
  type MatchedLineItem,
  REGION_LABELS_HE,
  RegionSchema,
  type Region,
  type Unit,
} from "@quatecalc/contracts";
import type { ScanJobView } from "@quatecalc/contracts";
import { useState } from "react";
import { parseMaterials } from "../../lib/parseMaterials";
import type { PricedLine } from "../types";

const SAMPLE = [
  "מלט אפור, 10, שק",
  "חול מחצבה, 5, מ\"ק",
  "בלוק איטונג 20, 120, יח'",
  "ברזל בניין 12 מ\"מ, 800, ק\"ג",
  "צבע אקרילי לבן, 4",
].join("\n");

/** Turn a matched line into the editable priced line used downstream. */
function toPricedLine(item: MatchedLineItem): PricedLine {
  const product = item.selectedProduct;
  // lineQuantity = packCount ?? requested quantity; unitPrice = product.price.
  const quantity = item.packCount ?? item.line.quantity;
  const unit: Unit = product?.unit ?? DEFAULT_UNIT;
  return {
    id: item.line.id,
    rawText: item.line.rawText,
    rawUnit: item.line.rawUnit,
    requestedQuantity: item.line.quantity,
    selectedProduct: product,
    status: item.status,
    description: product?.name ?? item.line.rawText,
    quantity,
    unit,
    unitPrice: product?.price ?? 0,
  };
}

export function InputStep({
  region,
  onRegionChange,
  onMatched,
}: {
  region: Region;
  onRegionChange: (r: Region) => void;
  onMatched: (lines: PricedLine[]) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});

  const parsed = parseMaterials(text);

  async function handleSubmit() {
    setError(null);
    if (parsed.length === 0) {
      setError("יש להזין לפחות שורת חומר אחת.");
      return;
    }
    setLoading(true);
    setProgress({});
    try {
      const start = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: parsed, region }),
      });
      if (!start.ok) {
        const b = await start.json().catch(() => ({}));
        throw new Error(b.error ?? "הסריקה נכשלה.");
      }
      const { jobId } = (await start.json()) as { jobId: string };

      const deadline = Date.now() + 90_000;
      for (;;) {
        if (Date.now() > deadline) throw new Error("הסריקה ארכה זמן רב מדי. נסו שוב.");
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(`/api/scan/${jobId}`);
        if (!res.ok) throw new Error("שגיאה בקבלת מצב הסריקה.");
        const view: ScanJobView = await res.json();
        setProgress(view.progress.perSupplier);
        if (view.status === "complete" && view.items) {
          onMatched(view.items.map(toPricedLine));
          return;
        }
        if (view.status === "failed") throw new Error(view.error ?? "הסריקה נכשלה.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "הסריקה נכשלה.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>1. הזנת חומרים</h2>
      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="region">אזור</label>
        <select
          id="region"
          value={region}
          onChange={(e) => onRegionChange(RegionSchema.parse(e.target.value))}
        >
          {RegionSchema.options.map((r) => (
            <option key={r} value={r}>
              {REGION_LABELS_HE[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="materials">רשימת חומרים</label>
        <textarea
          id="materials"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"שם חומר, כמות, יחידה\nשורה אחת לכל חומר"}
          dir="rtl"
        />
        <p className="hint">
          כל שורה: <strong>שם חומר, כמות, יחידה</strong> (מופרד בפסיק או טאב;
          היחידה אופציונלית). זוהו {parsed.length} שורות.
        </p>
      </div>

      {loading && Object.keys(progress).length > 0 && (
        <ul className="scan-progress" aria-live="polite">
          {Object.entries(progress).map(([supplier, state]) => (
            <li key={supplier}>
              {supplier}: {state === "done" ? "✓" : state === "error" ? "⚠" : state === "running" ? "סורק…" : "ממתין"}
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setText(SAMPLE)}
        >
          טען דוגמה
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleSubmit}
          disabled={loading || parsed.length === 0}
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? "סורק..." : "התאמת מוצרים →"}
        </button>
      </div>
    </section>
  );
}
