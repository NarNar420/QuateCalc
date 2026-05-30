/**
 * Catalog refresh job — the automated price-acquisition entry point.
 *
 * Usage:
 *   pnpm --filter @quatecalc/worker refresh -- [--supplier ace] [--region center] [--fixtures|--live] [--browser] [--proxy URL]
 *
 * --fixtures (default in non-production): scrape saved HTML offline.
 * --live: hit the real supplier site over plain HTTP (rate-limited, robots-respecting).
 * --live --browser: fetch via a real Chromium (Playwright) — executes JS and
 *   passes most anti-bot challenges (e.g. Cloudflare). Requires the browser
 *   binary: `pnpm --filter @quatecalc/scraper-browser install-browser`.
 * --proxy URL: route the browser through a proxy (IP rotation / geo).
 * --category <key|substring>: limit scraping to categories whose key matches exactly
 *   or whose label/URL contains the substring.
 * --sitemap: use the sitemap-driven ACE adapter (implies --browser; Product JSON-LD
 *   is JS-injected and requires a browser-rendered fetch).
 * --max-products N: cap the number of products crawled in sitemap mode (default: 50).
 *
 * The runner's health gate guarantees a broken scrape never wipes a good catalog.
 */
import { RegionSchema, type CategoryRef, type ScraperContext, type ScrapeRegion } from "@quatecalc/contracts";
import { getAdapter, runScrape } from "@quatecalc/scraper-core";
import { createAceSitemapAdapter, registerAllAdapters } from "@quatecalc/scraper-adapters";
import { fixtureContextBuilder, liveContextBuilder } from "./context.js";

interface Args {
  supplier: string;
  region: ScrapeRegion;
  live: boolean;
  browser: boolean;
  proxy?: string;
  category?: string;
  sitemap: boolean;
  maxProducts?: number;
}

function parseArgs(argv: string[]): Args {
  let supplier = "ace";
  let region = "center";
  // default to fixtures unless --live is passed or NODE_ENV=production
  let live = process.env.NODE_ENV === "production";
  let browser = false;
  let proxy: string | undefined;
  let category: string | undefined;
  let sitemap = false;
  let maxProducts: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--supplier") supplier = argv[++i] ?? supplier;
    else if (a === "--region") region = argv[++i] ?? region;
    else if (a === "--live") live = true;
    else if (a === "--fixtures") live = false;
    else if (a === "--browser") browser = true;
    else if (a === "--proxy") proxy = argv[++i];
    else if (a === "--category") category = argv[++i];
    else if (a === "--sitemap") sitemap = true;
    else if (a === "--max-products") maxProducts = Number(argv[++i]);
  }
  return { supplier, region: RegionSchema.parse(region), live, browser, proxy, category, sitemap, maxProducts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.sitemap && !args.browser) {
    args.browser = true;
    console.log("--sitemap requires browser rendering (Product JSON-LD is JS-injected); enabling --browser.");
  }

  registerAllAdapters();

  const adapter = args.sitemap
    ? createAceSitemapAdapter({ maxProducts: args.maxProducts })
    : getAdapter(args.supplier);
  if (!adapter) {
    console.error(`Unknown supplier "${args.supplier}". Did you register its adapter?`);
    process.exit(1);
  }

  // Choose the fetch context: fixtures (offline) | live HTTP | live browser.
  let buildContext: (region: ScrapeRegion) => ScraperContext;
  let closeTransport: (() => Promise<void>) | undefined;
  let mode: string;

  if (!args.live) {
    buildContext = fixtureContextBuilder(args.supplier);
    mode = "FIXTURES";
  } else if (args.browser) {
    // Dynamic import so Playwright is only loaded when actually scraping live.
    const { createBrowserTransport } = await import("@quatecalc/scraper-browser");
    const bt = createBrowserTransport({
      proxy: args.proxy,
      // Wait for the WooCommerce/listing grid (or category tiles) to render.
      waitForSelector: ".priceNum, .product-item-info",
      challengeWaitMs: 6000,
    });
    closeTransport = bt.close;
    buildContext = liveContextBuilder({ transport: bt.fetchText });
    mode = "LIVE+BROWSER";
  } else {
    buildContext = liveContextBuilder();
    mode = "LIVE(http)";
  }

  console.log(
    `Refreshing "${adapter.supplierKey}" region=${args.region} mode=${mode}` +
      `${args.category ? ` category=${args.category}` : ""}...`,
  );

  const categoryArg = args.category;
  const categoryFilter = categoryArg
    ? (c: CategoryRef) =>
        c.key === categoryArg ||
        c.label.includes(categoryArg) ||
        c.url.includes(categoryArg)
    : undefined;

  try {
    const result = await runScrape(adapter, args.region, { buildContext, categoryFilter });

    console.log("\n=== Scrape result ===");
    console.log(JSON.stringify(result, null, 2));

    if (result.status === "failed") {
      console.error(`\nRun FAILED (${result.notes ?? "unknown"}). Catalog left unchanged.`);
      process.exitCode = 2;
      return;
    }
    console.log(
      `\nDone: ${result.status}, ${result.productCount} products, promoted=${result.promoted}.`,
    );
  } finally {
    await closeTransport?.();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
