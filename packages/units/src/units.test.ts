import { describe, expect, it } from "vitest";
import { normalizeHebrew, tokenizeHebrew } from "./hebrew.js";
import { normalizeUnit } from "./normalizeUnit.js";
import { areUnitsCompatible, convertQuantity, resolvePackCount } from "./convert.js";

describe("normalizeHebrew", () => {
  it("strips quotes and folds final letters", () => {
    expect(normalizeHebrew('מ"ר')).toBe("מר");
    expect(normalizeHebrew("יח'")).toBe("יח");
    expect(normalizeHebrew("בלוקים")).toBe("בלוקימ");
  });

  it("collapses whitespace and punctuation", () => {
    expect(normalizeHebrew("  מלט   אפור,  50 ")).toBe("מלט אפור 50");
  });

  it("tokenizes", () => {
    expect(tokenizeHebrew("מלט אפור")).toEqual(["מלט", "אפור"]);
  });
});

describe("normalizeUnit", () => {
  it("maps common Hebrew units", () => {
    expect(normalizeUnit('מ"ר')).toBe("square_meter");
    expect(normalizeUnit("שק")).toBe("bag");
    expect(normalizeUnit("יח'")).toBe("piece");
    expect(normalizeUnit('ק"ג')).toBe("kilogram");
    expect(normalizeUnit("קוב")).toBe("cubic_meter");
  });

  it("extracts unit from a trailing token", () => {
    expect(normalizeUnit("10 שקים")).toBe("bag");
  });

  it("returns null for unknown units", () => {
    expect(normalizeUnit("בלבל")).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
  });
});

describe("convert", () => {
  it("converts within mass family", () => {
    expect(convertQuantity(2, "ton", "kilogram")).toBe(2000);
    expect(convertQuantity(500, "kilogram", "ton")).toBe(0.5);
  });

  it("rejects incompatible units", () => {
    expect(convertQuantity(1, "meter", "kilogram")).toBeNull();
    expect(areUnitsCompatible("meter", "kilogram")).toBe(false);
    expect(areUnitsCompatible("ton", "kilogram")).toBe(true);
  });

  it("computes pack counts rounded up", () => {
    // need 110kg, bag holds 25kg => 5 bags
    expect(resolvePackCount(110, 25)).toBe(5);
    expect(resolvePackCount(10, 1)).toBe(10);
  });
});
