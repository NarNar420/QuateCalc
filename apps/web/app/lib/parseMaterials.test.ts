import { describe, expect, it } from "vitest";
import { parseMaterials } from "./parseMaterials.js";

describe("parseMaterials", () => {
  it("returns an empty array for empty input", () => {
    expect(parseMaterials("")).toEqual([]);
    expect(parseMaterials("   \n  \n")).toEqual([]);
  });

  it("parses a comma-separated line with name, quantity and unit", () => {
    const lines = parseMaterials("מלט אפור, 10, שק");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      rawText: "מלט אפור",
      quantity: 10,
      rawUnit: "שק",
    });
    expect(lines[0]?.id).toBeTruthy();
  });

  it("parses tab-separated lines", () => {
    const lines = parseMaterials("חול\t5\tמ\"ק");
    expect(lines[0]).toMatchObject({ rawText: "חול", quantity: 5, rawUnit: 'מ"ק' });
  });

  it("defaults quantity to 1 when missing or invalid", () => {
    expect(parseMaterials("בלוק")[0]?.quantity).toBe(1);
    expect(parseMaterials("בלוק, abc")[0]?.quantity).toBe(1);
    expect(parseMaterials("בלוק, -3")[0]?.quantity).toBe(1);
  });

  it("leaves rawUnit undefined when no unit field is given", () => {
    expect(parseMaterials("מלט, 10")[0]?.rawUnit).toBeUndefined();
  });

  it("parses decimal quantities", () => {
    expect(parseMaterials("דבק, 2.5, שק")[0]?.quantity).toBe(2.5);
  });

  it("skips blank lines and generates unique ids", () => {
    const lines = parseMaterials("מלט, 10, שק\n\nחול, 5, מ\"ק");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.id).not.toBe(lines[1]?.id);
  });
});
