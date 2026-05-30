import type { RawProduct } from "@quatecalc/contracts";

/** Extract all <loc> values from a sitemap index or urlset XML. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
}

/** ACE product URLs end in a numeric id, e.g. /.../flower-pots/102040102. */
export function isProductUrl(url: string): boolean {
  return /\/\d{5,}$/.test(url);
}

/**
 * Parse a product page's schema.org Product JSON-LD into a partial RawProduct.
 * ACE injects this block via JS, so the caller must pass browser-rendered HTML.
 * Returns null when no Product block or no price is present. SKU falls back to
 * the trailing numeric segment of the URL (ACE's product id).
 */
export function parseProductJsonLd(
  html: string,
  url: string,
): Pick<RawProduct, "name" | "priceRaw" | "sku" | "url"> | null {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]!,
  );
  for (const s of scripts) {
    let json: unknown;
    try {
      json = JSON.parse(s);
    } catch {
      continue;
    }
    const arr = Array.isArray(json) ? json : [json];
    const prod = arr.find(
      (x) => x && typeof x === "object" && (x as { "@type"?: string })["@type"] === "Product",
    ) as { name?: string; sku?: string; offers?: { price?: string | number } } | undefined;
    if (!prod) continue;
    const price = prod.offers?.price;
    const name = prod.name?.trim();
    if (!name || price == null) return null;
    const sku = prod.sku?.toString().trim() || url.split("/").filter(Boolean).pop();
    return { name, priceRaw: `₪${price}`, sku, url };
  }
  return null;
}
