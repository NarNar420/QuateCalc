import { describe, expect, it } from "vitest";
import { DEFAULT_UA, stealthInitScript } from "./stealth.js";

describe("stealthInitScript", () => {
  const script = stealthInitScript();

  it("masks the key headless tells", () => {
    expect(script).toContain("navigator, 'webdriver'");
    expect(script).toContain("navigator, 'languages'");
    expect(script).toContain("navigator, 'plugins'");
    expect(script).toContain("window.chrome");
  });

  it("is self-contained and error-tolerant", () => {
    // wrapped in an IIFE + try/catch so it can't break page load
    expect(script).toContain("try {");
    expect(script).toContain("catch");
  });
});

describe("DEFAULT_UA", () => {
  it("looks like a real desktop Chrome UA", () => {
    expect(DEFAULT_UA).toMatch(/Chrome\/\d+/);
    expect(DEFAULT_UA).toContain("Safari/537.36");
  });
});
