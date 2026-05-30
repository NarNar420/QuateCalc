"use client";

import {
  DEFAULT_UNIT,
  type MatchedLineItem,
  REGION_LABELS_HE,
  RegionSchema,
  type Region,
  type Unit,
} from "@quatecalc/contracts";
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

  const parsed = parseMaterials(text);

  async function handleSubmit() {
    setError(null);
    if (parsed.length === 0) {
      setError("יש להזין לפחות שורת חומר אחת.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: parsed, region }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "ההתאמה נכשלה.");
      }
      const data: { items: MatchedLineItem[] } = await res.json();
      onMatched(data.items.map(toPricedLine));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההתאמה נכשלה.");
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
          {loading ? "מתאים..." : "התאמת מוצרים →"}
        </button>
      </div>
    </section>
  );
}
