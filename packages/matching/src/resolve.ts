import type { CatalogProduct, MaterialLine } from "@quatecalc/contracts";
import { areUnitsCompatible, convertQuantity, normalizeUnit, resolvePackCount } from "@quatecalc/units";

export interface ResolvedQuantity {
  resolvedUnit: CatalogProduct["unit"];
  resolvedQuantity: number;
  packCount: number;
}

/**
 * Map a user's requested quantity onto a chosen product's purchasable units.
 *
 * - `resolvedUnit` is always the product's canonical unit.
 * - `resolvedQuantity` is the user's quantity expressed in that unit: when the
 *   user gave a unit that is dimensionally compatible we convert it; otherwise
 *   (no unit, unrecognized unit, or incompatible family) we treat the requested
 *   quantity as already being in the product's unit.
 * - `packCount` is how many whole purchasable units to buy (rounded up).
 *
 * Defensive: never throws — falls back to the requested quantity on any failure.
 */
export function resolveQuantity(line: MaterialLine, product: CatalogProduct): ResolvedQuantity {
  const resolvedUnit = product.unit;
  let resolvedQuantity = line.quantity;

  try {
    const parsedUnit = normalizeUnit(line.rawUnit);
    if (parsedUnit && areUnitsCompatible(parsedUnit, resolvedUnit)) {
      const converted = convertQuantity(line.quantity, parsedUnit, resolvedUnit);
      if (converted !== null && Number.isFinite(converted) && converted > 0) {
        resolvedQuantity = converted;
      }
    }
  } catch {
    // Fall back to the raw requested quantity.
    resolvedQuantity = line.quantity;
  }

  let packCount: number;
  try {
    const packSize = product.packSize > 0 ? product.packSize : 1;
    packCount = resolvePackCount(resolvedQuantity, packSize);
    if (!Number.isFinite(packCount) || packCount <= 0) {
      packCount = Math.max(1, Math.ceil(resolvedQuantity));
    }
  } catch {
    packCount = Math.max(1, Math.ceil(resolvedQuantity));
  }

  return { resolvedUnit, resolvedQuantity, packCount };
}
