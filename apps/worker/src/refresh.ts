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
 * --headful: show the browser window (local debugging of challenges).
 * --proxy URL: route the browser through a proxy (IP rotation / geo).
 *
 * The runner's health gate guarantees a broken scrape never wipes a good catalog.
 */
import { RegionSchema, type ScraperContext, type ScrapeRegion } from "@quatecalc/contracts";
import { getAdapter, runScrape } from "@quatecalc/scraper-core";
import { registerAllAdapters } from "@quatecalc/scraper-adapters";
import { fixtureContextBuilder, liveContextBuilder } from "./context.js";

interface Args {
  supplier: string;
  region: ScrapeRegion;
  live: boolean;
  browser: boolean;
  headful: boolean;
  proxy?: string;
}

function parseArgs(argv: string[]): Args {
  let supplier = "ace";
  let region = "center";
  // default to fixtures unless --live is passed or NODE_ENV=production
  let live = process.env.NODE_ENV === "production";
  let browser = false;
  let headful = false;
  let proxy: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--supplier") supplier = argv[++i] ?? supplier;
    else if (a === "--region") region = argv[++i] ?? region;
    else if (a === "--live") live = true;
    else if (a === "--fixtures") live = false;
    else if (a === "--browser") browser = true;
    else if (a === "--headful") {
      browser = true;
      headful = true;
    } else if (a === "--proxy") proxy = argv[++i];
  }
  return { supplier, region: RegionSchema.parse(region), live, browser, headful, proxy };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  registerAllAdapters();

  const adapter = getAdapter(args.supplier);
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
      headless: !args.headful,
      proxy: args.proxy,
      // Wait for the WooCommerce/listing grid (or category tiles) to render.
      waitForSelector: "ul.products, ul.product-categories, li.product",
      challengeWaitMs: 1500,
    });
    closeTransport = bt.close;
    buildContext = liveContextBuilder({ transport: bt.fetchText });
    mode = "LIVE+BROWSER";
  } else {
    buildContext = liveContextBuilder();
    mode = "LIVE(http)";
  }

  console.log(`Refreshing "${adapter.supplierKey}" region=${args.region} mode=${mode}...`);

  try {
    const result = await runScrape(adapter, args.region, { buildContext });

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
