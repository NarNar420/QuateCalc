import { z } from "zod";

/**
 * Canonical units of measure for building/renovation materials.
 * Free-text Hebrew unit strings (e.g. "מ\"ר", "שק", "יח'") are normalized into
 * one of these by the @quatecalc/units package.
 */
export const UnitSchema = z.enum([
  "piece", // יחידה / יח'
  "meter", // מטר אורך / מ"א
  "square_meter", // מ"ר
  "cubic_meter", // מ"ק / קוב
  "kilogram", // ק"ג
  "ton", // טון
  "liter", // ליטר
  "bag", // שק (e.g. מלט/דבק) — packSize carries the kg per bag when known
  "roll", // גליל
  "sheet", // לוח / יריעה
  "pack", // אריזה / מארז
]);
export type Unit = z.infer<typeof UnitSchema>;

export const UNIT_LABELS_HE: Record<Unit, string> = {
  piece: "יח'",
  meter: "מ'",
  square_meter: 'מ"ר',
  cubic_meter: 'מ"ק',
  kilogram: 'ק"ג',
  ton: "טון",
  liter: "ליטר",
  bag: "שק",
  roll: "גליל",
  sheet: "לוח",
  pack: "אריזה",
};

export const DEFAULT_UNIT: Unit = "piece";
