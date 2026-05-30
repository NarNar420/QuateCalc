/**
 * Catalog refresh job — the MVP's automated price-acquisition entry point.
 *
 * Usage:
 *   pnpm --filter @quatecalc/worker refresh -- [--supplier ace] [--region center] [--fixtures] [--live]
 *
 * --fixtures (default in non-production): scrape saved HTML offline.
 * --live: hit the real supplier site (rate-limited, robots-respecting).
 *
 * The runner's health gate guarantees a broken scrape never wipes a good catalog.
 */
import { RegionSchema, type ScrapeRegion } from "@quatecalc/contracts";
import { getAdapter } from "@quatecalc/scraper-core";
import { registerAllAdapters } from "@quatecalc/scraper-adapters";
import { runScrape } from "@quatecalc/scraper-core";
import { buildLiveContext, fixtureContextBuilder } from "./context.js";

interface Args {
  supplier: string;
  region: ScrapeRegion;
  live: boolean;
}

function parseArgs(argv: string[]): Args {
  let supplier = "ace";
  let region = "center";
  // default to fixtures unless --live is passed or NODE_ENV=production
  let live = process.env.NODE_ENV === "production";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--supplier") supplier = argv[++i] ?? supplier;
    else if (a === "--region") region = argv[++i] ?? region;
    else if (a === "--live") live = true;
    else if (a === "--fixtures") live = false;
  }
  return { supplier, region: RegionSchema.parse(region), live };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Register available adapters.
  registerAllAdapters();

  const adapter = getAdapter(args.supplier);
  if (!adapter) {
    console.error(`Unknown supplier "${args.supplier}". Did you register its adapter?`);
    process.exit(1);
  }

  const buildContext = args.live ? buildLiveContext : fixtureContextBuilder(args.supplier);
  console.log(
    `Refreshing "${adapter.supplierKey}" region=${args.region} mode=${args.live ? "LIVE" : "FIXTURES"}...`,
  );

  const result = await runScrape(adapter, args.region, { buildContext });

  console.log("\n=== Scrape result ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "failed") {
    console.error(`\nRun FAILED (${result.notes ?? "unknown"}). Catalog left unchanged.`);
    process.exit(2);
  }
  console.log(`\nDone: ${result.status}, ${result.productCount} products, promoted=${result.promoted}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
