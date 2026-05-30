import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScraperContext, ScrapeRegion } from "@quatecalc/contracts";
import {
  createFetchText,
  createPageCache,
  createRateLimiter,
  createRobotsChecker,
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
 * LIVE context: polite, rate-limited, robots-respecting, cached fetch against
 * the real supplier site. Use only where the supplier's ToS permits.
 */
export function buildLiveContext(region: ScrapeRegion): ScraperContext {
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
  });
  return { fetchText, region, log: makeLog() };
}

/**
 * FIXTURE context: serves saved HTML from the ACE adapter's __fixtures__ dir,
 * mapping request URLs by path. Lets the full scrape->normalize->DB pipeline
 * run offline (sandbox / CI / dev) without hitting the network.
 */
export function buildFixtureContext(region: ScrapeRegion): ScraperContext {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // apps/worker/src -> repo root -> the adapter fixtures
  const fixturesDir = path.resolve(
    here,
    "../../../packages/scraper-adapters/src/ace/__fixtures__",
  );

  const map: Record<string, string> = {
    "/categories": "categories.html",
    "/categories/building-materials": "products-page1.html",
    "/categories/building-materials?page=2": "products-page2.html",
  };

  const fetchText = async (url: string): Promise<string> => {
    const u = new URL(url);
    const key = u.search ? `${u.pathname}${u.search}` : u.pathname;
    const file = map[key];
    if (!file) return ""; // unknown path => empty page => category ends cleanly
    return readFile(path.join(fixturesDir, file), "utf8");
  };

  return { fetchText, region, log: makeLog() };
}
