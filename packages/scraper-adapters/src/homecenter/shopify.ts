import type { RawProduct } from "@quatecalc/contracts";

interface ShopifyVariant {
  sku?: string;
  price?: string;
}
interface ShopifyProduct {
  title?: string;
  handle?: string;
  product_type?: string;
  variants?: ShopifyVariant[];
}

export interface ShopifyParseContext {
  baseUrl: string;
}

/**
 * Parse a Shopify `/products.json` payload into RawProducts. Uses the first
 * variant's price + sku, the product handle for the URL, and product_type as
 * the category breadcrumb. Products without a title, price, or handle are
 * skipped (those are the fields the runner relies on).
 */
export function parseShopifyProducts(jsonText: string, ctx: ShopifyParseContext): RawProduct[] {
  let data: { products?: ShopifyProduct[] };
  try {
    data = JSON.parse(jsonText) as { products?: ShopifyProduct[] };
  } catch {
    return [];
  }
  const out: RawProduct[] = [];
  for (const p of data.products ?? []) {
    const variant = p.variants?.[0];
    const name = p.title?.trim();
    const price = variant?.price;
    if (!name || price == null || price === "" || !p.handle) continue;
    out.push({
      name,
      priceRaw: `₪${price}`,
      sku: variant?.sku?.trim() || p.handle,
      url: `${ctx.baseUrl}/products/${p.handle}`,
      categoryPath: p.product_type ? [p.product_type] : undefined,
    });
  }
  return out;
}
