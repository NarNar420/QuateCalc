import type { PageCache } from "./cache.js";
import type { RateLimiter } from "./rateLimiter.js";
import type { RobotsChecker } from "./robots.js";

export interface FetcherDeps {
  /** Polite User-Agent string sent on every request. */
  userAgent: string;
  rateLimiter: RateLimiter;
  robots: RobotsChecker;
  cache: PageCache;
  /** When false, skip the robots.txt check (e.g. for dev). Default true. */
  respectRobots?: boolean;
  /** Cache TTL for fetched pages, seconds. */
  cacheTtlSec?: number;
  /** Injectable fetch (defaults to global fetch) for hermetic tests. */
  fetchImpl?: typeof fetch;
}

/** Error thrown when robots.txt disallows a URL. */
export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`Blocked by robots.txt: ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

/** Upgrade plain http to https; leave other schemes/relative urls alone. */
function upgradeToHttps(url: string): string {
  return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Build the `fetchText(url)` used as `ctx.fetchText`: it upgrades http->https,
 * enforces robots.txt, serves from cache, and otherwise performs a rate-limited
 * fetch with the polite UA, caching the body before returning it.
 */
export function createFetchText(deps: FetcherDeps): (url: string) => Promise<string> {
  const {
    userAgent,
    rateLimiter,
    robots,
    cache,
    respectRobots = true,
    cacheTtlSec = 3600,
    fetchImpl,
  } = deps;
  const doFetch = fetchImpl ?? fetch;

  return async function fetchText(rawUrl: string): Promise<string> {
    const url = upgradeToHttps(rawUrl);

    if (respectRobots) {
      const allowed = await robots.isAllowed(url);
      if (!allowed) throw new RobotsDisallowedError(url);
    }

    const cached = await cache.get(url);
    if (cached !== null) return cached;

    const body = await rateLimiter.schedule(hostOf(url), async () => {
      const res = await doFetch(url, {
        headers: { "User-Agent": userAgent },
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
      }
      return res.text();
    });

    await cache.set(url, body, cacheTtlSec);
    return body;
  };
}
