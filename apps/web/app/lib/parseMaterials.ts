import type { MaterialLine } from "@quatecalc/contracts";

/**
 * Parse a free-text material list into MaterialLine[].
 *
 * Each non-empty line is expected to look like:
 *   `שם חומר, כמות, יחידה`
 * fields separated by a comma or a tab. The unit field is optional.
 *
 * - The first field is the material name (rawText) — required.
 * - The second field (if numeric) is the quantity; defaults to 1 when missing
 *   or unparseable. Hebrew/locale digits are not handled — we expect plain
 *   ASCII digits with an optional decimal dot.
 * - The third field (if present) is the free-text unit (rawUnit).
 *
 * Lines with an empty name are skipped. Ids are generated deterministically by
 * index so re-parsing the same text is stable within a session.
 */
export function parseMaterials(input: string): MaterialLine[] {
  if (!input) return [];

  const lines: MaterialLine[] = [];
  const rows = input.split(/\r?\n/);

  let index = 0;
  for (const row of rows) {
    if (!row.trim()) continue;

    // Split on tab or comma, trim each field.
    const fields = row
      .split(/[\t,]/)
      .map((f) => f.trim());

    const rawText = fields[0] ?? "";
    if (!rawText) continue;

    const quantity = parseQuantity(fields[1]);
    const rawUnit = fields[2] && fields[2].length > 0 ? fields[2] : undefined;

    lines.push({
      id: `line-${index}`,
      rawText,
      quantity,
      rawUnit,
    });
    index++;
  }

  return lines;
}

/** Parse a quantity field into a positive number; default 1 on failure. */
function parseQuantity(field: string | undefined): number {
  if (!field) return 1;
  // Allow a decimal comma as well by normalizing it — but note the field was
  // already split on commas, so this mainly catches a stray dot/comma mix.
  const normalized = field.replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}
