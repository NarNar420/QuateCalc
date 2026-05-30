"use client";

import {
  DEFAULT_REGION,
  DEFAULT_VAT_PERCENT,
  type OverheadItem,
  type Region,
} from "@quatecalc/contracts";
import { useState } from "react";
import { ConfigStep } from "./steps/ConfigStep";
import { InputStep } from "./steps/InputStep";
import { QuoteStep } from "./steps/QuoteStep";
import { ReviewStep } from "./steps/ReviewStep";
import type { ConfigState, PricedLine } from "./types";

const STEP_LABELS = [
  "הזנת חומרים",
  "סקירת התאמות",
  "הוצאות ורווח",
  "הצעת מחיר",
] as const;

const DEFAULT_OVERHEAD: OverheadItem[] = [
  { label: "הובלה", kind: "fixed", value: 250 },
  { label: "פחת", kind: "percent", value: 5 },
];

export function Wizard() {
  const [step, setStep] = useState(0);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [pricedLines, setPricedLines] = useState<PricedLine[]>([]);
  const [config, setConfig] = useState<ConfigState>({
    overhead: DEFAULT_OVERHEAD,
    marginPercent: 12,
    vatPercent: DEFAULT_VAT_PERCENT,
  });

  return (
    <>
      <nav className="steps" aria-label="שלבים">
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className={`step-chip ${i === step ? "active" : ""} ${
              i < step ? "done" : ""
            }`}
          >
            <span className="step-num">{i < step ? "✓" : i + 1}</span>
            {label}
          </div>
        ))}
      </nav>

      {step === 0 && (
        <InputStep
          region={region}
          onRegionChange={setRegion}
          onMatched={(lines) => {
            setPricedLines(lines);
            setStep(1);
          }}
        />
      )}

      {step === 1 && (
        <ReviewStep
          region={region}
          pricedLines={pricedLines}
          onChange={setPricedLines}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <ConfigStep
          config={config}
          onChange={setConfig}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <QuoteStep
          region={region}
          pricedLines={pricedLines}
          config={config}
          onBack={() => setStep(2)}
        />
      )}
    </>
  );
}
