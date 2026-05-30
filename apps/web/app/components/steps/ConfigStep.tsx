"use client";

import type { OverheadItem } from "@quatecalc/contracts";
import type { ConfigState } from "../types";

export function ConfigStep({
  config,
  onChange,
  onBack,
  onNext,
}: {
  config: ConfigState;
  onChange: (c: ConfigState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function updateOverhead(index: number, patch: Partial<OverheadItem>) {
    const overhead = config.overhead.map((o, i) =>
      i === index ? { ...o, ...patch } : o,
    );
    onChange({ ...config, overhead });
  }

  function addOverhead() {
    onChange({
      ...config,
      overhead: [
        ...config.overhead,
        { label: "", kind: "fixed", value: 0 },
      ],
    });
  }

  function removeOverhead(index: number) {
    onChange({
      ...config,
      overhead: config.overhead.filter((_, i) => i !== index),
    });
  }

  return (
    <section className="card">
      <h2>3. הוצאות ורווח</h2>

      <div className="field">
        <label>הוצאות נוספות (הובלה, פחת וכו')</label>
        <p className="hint">
          סכום קבוע (₪) או אחוז מסך החומרים. שורת אחוז: ערך 5 = 5%.
        </p>
        {config.overhead.map((item, i) => (
          <div className="overhead-row" key={i}>
            <input
              type="text"
              placeholder="תיאור (למשל הובלה)"
              value={item.label}
              onChange={(e) => updateOverhead(i, { label: e.target.value })}
            />
            <select
              value={item.kind}
              onChange={(e) =>
                updateOverhead(i, {
                  kind: e.target.value as OverheadItem["kind"],
                })
              }
            >
              <option value="fixed">סכום קבוע (₪)</option>
              <option value="percent">אחוז (%)</option>
            </select>
            <input
              className="num"
              type="number"
              min={0}
              step="any"
              value={item.value}
              onChange={(e) =>
                updateOverhead(i, {
                  value: Number.parseFloat(e.target.value) || 0,
                })
              }
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="הסר"
              onClick={() => removeOverhead(i)}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn ghost small" onClick={addOverhead}>
          + הוסף הוצאה
        </button>
      </div>

      <div className="field">
        <label htmlFor="margin">אחוז רווח (%)</label>
        <input
          id="margin"
          className="num"
          type="number"
          min={0}
          step="any"
          style={{ maxWidth: 200 }}
          value={config.marginPercent}
          onChange={(e) =>
            onChange({
              ...config,
              marginPercent: Number.parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>

      <div className="field">
        <label htmlFor="vat">מע"מ (%)</label>
        <input
          id="vat"
          className="num"
          type="number"
          min={0}
          step="any"
          style={{ maxWidth: 200 }}
          value={config.vatPercent}
          onChange={(e) =>
            onChange({
              ...config,
              vatPercent: Number.parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          → חזרה
        </button>
        <button type="button" className="btn" onClick={onNext}>
          הפק הצעת מחיר →
        </button>
      </div>
    </section>
  );
}
