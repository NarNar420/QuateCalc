import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCategoryList, parseNextPageUrl, parseProducts } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(here, "__fixtures__", name), "utf8");

const BASE = "https://www.ace.co.il";

describe("parseCategoryList", () => {
  it("extracts categories with absolute URLs, labels, and keys", () => {
    const cats = parseCategoryList(fixture("categories.html"), { baseUrl: BASE });
    expect(cats).toHaveLength(3);
    expect(cats[0]).toEqual({
      key: "building-materials",
      label: "חומרי בניין",
      url: "https://www.ace.co.il/categories/building-materials",
    });
    // already-absolute href is preserved
    expect(cats[1]?.url).toBe("https://www.ace.co.il/categories/adhesives");
    expect(cats[2]?.key).toBe("drywall");
    // the non-category .other-link anchor is ignored
    expect(cats.some((c) => c.label === "אודות")).toBe(false);
  });
});

describe("parseProducts", () => {
  it("extracts name, price text, unit hint, sku and absolute url", () => {
    const products = parseProducts(fixture("products-page1.html"), {
      baseUrl: BASE,
      categoryPath: ["חומרי בניין"],
    });
    expect(products).toHaveLength(3);

    const melet = products[0];
    expect(melet?.name).toBe('מלט אפור 25 ק"ג');
    expect(melet?.priceRaw).toBe("₪ 28.90");
    expect(melet?.unitRaw).toBe("שק");
    expect(melet?.sku).toBe("MLT-25");
    expect(melet?.url).toBe("https://www.ace.co.il/p/melet-afor-25kg");
    expect(melet?.categoryPath).toEqual(["חומרי בניין"]);

    // already-absolute product url preserved
    expect(products[1]?.url).toBe("https://www.ace.co.il/p/devek-arichim-25kg");
    expect(products[1]?.priceRaw).toBe('42.50 ש"ח');

    expect(products[2]?.name).toBe('לוח גבס לבן 12.5 מ"מ');
    expect(products[2]?.unitRaw).toBe("לוח");
  });

  it("returns an empty array for a page with no product cards", () => {
    expect(parseProducts("<html><body><p>אין מוצרים</p></body></html>", { baseUrl: BASE })).toEqual(
      [],
    );
  });
});

describe("parseNextPageUrl", () => {
  it("returns the absolute next-page url when present", () => {
    expect(parseNextPageUrl(fixture("products-page1.html"), { baseUrl: BASE })).toBe(
      "https://www.ace.co.il/categories/building-materials?page=2",
    );
  });

  it("returns null on the last page", () => {
    expect(parseNextPageUrl(fixture("products-page2.html"), { baseUrl: BASE })).toBeNull();
  });
});
