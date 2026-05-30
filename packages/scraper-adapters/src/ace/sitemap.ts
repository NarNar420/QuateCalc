/** Extract all <loc> values from a sitemap index or urlset XML. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
}

/** ACE sitemap leaf-category URLs end in a numeric id, e.g. /.../flower-pots/102040102. */
export function isLeafCategoryUrl(url: string): boolean {
  return /\/\d{5,}$/.test(url);
}
