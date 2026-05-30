import { describe, expect, it } from "vitest";
import { matchLines } from "./match.js";

/**
 * Integration test against the already-seeded DB (read-only).
 * The seed contains items like "מלט אפור CEM II 50 קג" in region "center".
 * If the DB is unreachable this single test fails, but the pure tests still
 * exercise the scoring/resolve logic without any DB.
 */
describe("matchLines (integration, region=center)", () => {
  it('matches "מלט אפור" to a product whose name contains מלט', async () => {
    const results = await matchLines(
      [{ id: "1", rawText: "מלט אפור", quantity: 10, rawUnit: "שק" }],
      { region: "center" },
    );

    expect(results).toHaveLength(1);
    const [item] = results;
    expect(item.status).not.toBe("no_match");
    expect(item.selectedProduct).not.toBeNull();
    expect(item.selectedProduct?.name).toContain("מלט");
    expect(item.resolvedQuantity).toBeGreaterThan(0);
    expect(item.packCount).toBeGreaterThan(0);
  });
});
