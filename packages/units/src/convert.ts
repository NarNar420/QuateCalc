import type { Unit } from "@quatecalc/contracts";

/**
 * Units that are dimensionally interchangeable, with conversion factors to a
 * base unit. Used to convert a user's requested quantity into a product's
 * canonical unit when both belong to the same family.
 */
const FAMILIES: Array<{ base: Unit; factors: Partial<Record<Unit, number>> }> = [
  // mass: base kilogram
  { base: "kilogram", factors: { kilogram: 1, ton: 1000 } },
];

/** Returns the family conversion factor of `unit` to its base, or null. */
function familyOf(unit: Unit): { base: Unit; factor: number } | null {
  for (const fam of FAMILIES) {
    const f = fam.factors[unit];
    if (f !== undefined) return { base: fam.base, factor: f };
  }
  return null;
}

/**
 * Check whether `from` can be converted to `to`.
 * Identical units are always compatible; otherwise they must share a family.
 */
export function areUnitsCompatible(from: Unit, to: Unit): boolean {
  if (from === to) return true;
  const a = familyOf(from);
  const b = familyOf(to);
  return !!a && !!b && a.base === b.base;
}

/**
 * Convert `quantity` of `from` into `to`. Returns null if incompatible.
 */
export function convertQuantity(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity;
  const a = familyOf(from);
  const b = familyOf(to);
  if (!a || !b || a.base !== b.base) return null;
  // to base, then to target
  return (quantity * a.factor) / b.factor;
}

/**
 * Given a desired quantity in the product's canonical `unit`, and the product's
 * pack size (canonical units per purchasable unit), compute how many whole
 * purchasable units to buy (rounded up) and the cost-driving pack count.
 */
export function resolvePackCount(canonicalQuantity: number, packSize: number): number {
  if (packSize <= 0) return canonicalQuantity;
  return Math.ceil(canonicalQuantity / packSize);
}
