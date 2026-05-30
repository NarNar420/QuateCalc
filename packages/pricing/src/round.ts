/**
 * Rounds a monetary value to 2 decimal places (agorot).
 * Uses "round half away from zero" — the standard expectation for financial
 * arithmetic.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
