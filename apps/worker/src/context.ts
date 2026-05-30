import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScraperContext, ScrapeRegion } from "@quatecalc/contracts";
import {
  createFetchText,
  createPageCache,
  createRateLimiter,
  createRobotsChecker,
  type Transport,
} from "@quatecalc/scraper-core";

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ?? "QuateCalcBot/0.1 (+mailto:contact@example.com)";

function makeLog(): ScraperContext["log"] {
  return (level, msg, meta) => {
    const line = `[scraper:${level}] ${msg}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  };
}

/**
 * LIVE context factory: polite, rate-limited, robots-respecting, cached fetch
 * against a real supplier site. The `transport` decides HOW pages are fetched —
 * plain HTTP by default, or a real browser (Playwright) for JS/anti-bot sites.
 * robots.txt is always fetched over plain HTTP (it's static text). Use only
 * where the supplier's ToS permits.
 */
export function liveContextBuilder(opts: { transport?: Transport } = {}) {
  return (region: ScrapeRegion): ScraperContext => {
    const rateLimiter = createRateLimiter();
    const cache = createPageCache();
    const fetchTextRaw = (url: string) => fetch(url).then((r) => r.text());
    const robots = createRobotsChecker(fetchTextRaw, USER_AGENT);
    const fetchText = createFetchText({
      userAgent: USER_AGENT,
      rateLimiter,
      robots,
      cache,
      respectRobots: process.env.SCRAPER_RESPECT_ROBOTS !== "false",
      transport: opts.transport,
    });
    return { fetchText, region, log: makeLog() };
  };
}

/** Per-supplier fixture wiring: fixtures dir + URL-path -> filename map. */
const FIXTURE_SUPPLIERS: Record<string, { dir: string; map: Record<string, string> }> = {
  ace: {
    dir: "packages/scraper-adapters/src/ace/__fixtures__",
    map: {
      "/tools-paint-affixing": "category-listing.html",
    },
  },
  tambour: {
    dir: "packages/scraper-adapters/src/tambour/__fixtures__",
    map: {
      "/shop/": "shop.html",
      "/product-category/paints/": "products-page1.html",
      "/product-category/paints/page/2/": "products-page2.html",
    },
  },
};

function repoRoot(): string {
  // apps/worker/src -> apps/worker -> apps -> repo root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/**
 * Build a FIXTURE context factory for a given supplier: serves saved HTML by
 * URL path so the full scrape->normalize->DB pipeline runs offline (sandbox /
 * CI / dev) without hitting the network or a supplier's anti-bot protection.
 */
export function fixtureContextBuilder(
  supplierKey: string,
): (region: ScrapeRegion) => ScraperContext {
  const cfg = FIXTURE_SUPPLIERS[supplierKey];
  if (!cfg) {
    throw new Error(
      `No fixtures registered for supplier "${supplierKey}". Use --live or add fixtures.`,
    );
  }
  const fixturesDir = path.join(repoRoot(), cfg.dir);

  return (region: ScrapeRegion): ScraperContext => {
    const fetchText = async (url: string): Promise<string> => {
      const u = new URL(url);
      const key = u.search ? `${u.pathname}${u.search}` : u.pathname;
      const file = cfg.map[key];
      if (!file) return ""; // unknown path => empty page => category ends cleanly
      return readFile(path.join(fixturesDir, file), "utf8");
    };
    return { fetchText, region, log: makeLog() };
  };
}
