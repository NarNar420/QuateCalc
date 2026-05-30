import type { PageCache } from "./cache.js";
import type { RateLimiter } from "./rateLimiter.js";
import type { RobotsChecker } from "./robots.js";

/**
 * A transport fetches the HTML/text of a URL. Different implementations trade
 * off cost vs. anti-bot resilience: plain HTTP (cheap), a real browser
 * (Playwright — executes JS, passes most challenges), or a third-party scraping
 * API. The robots/rate-limit/cache wrapping in `createFetchText` is applied on
 * top of ANY transport, so adapters are completely transport-agnostic.
 */
export type Transport = (url: string, userAgent: string) => Promise<string>;

/** Default transport: a plain rate-limited HTTP GET. */
export function httpTransport(fetchImpl?: typeof fetch): Transport {
  const doFetch = fetchImpl ?? fetch;
  return async (url, userAgent) => {
    const res = await doFetch(url, {
      headers: { "User-Agent": userAgent },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
    }
    return res.text();
  };
}

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
  /** How pages are actually fetched. Defaults to {@link httpTransport}. */
  transport?: Transport;
  /** Injectable fetch for the default HTTP transport (hermetic tests). */
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
  // Leave localhost/127.* alone so local fixture servers (dev/tests) work.
  if (/^http:\/\/(localhost|127\.|\[::1\])/i.test(url)) return url;
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
 * fetch via the configured transport, caching the body before returning it.
 */
export function createFetchText(deps: FetcherDeps): (url: string) => Promise<string> {
  const {
    userAgent,
    rateLimiter,
    robots,
    cache,
    respectRobots = true,
    cacheTtlSec = 3600,
  } = deps;
  const transport = deps.transport ?? httpTransport(deps.fetchImpl);

  return async function fetchText(rawUrl: string): Promise<string> {
    const url = upgradeToHttps(rawUrl);

    if (respectRobots) {
      const allowed = await robots.isAllowed(url);
      if (!allowed) throw new RobotsDisallowedError(url);
    }

    const cached = await cache.get(url);
    if (cached !== null) return cached;

    const body = await rateLimiter.schedule(hostOf(url), () => transport(url, userAgent));

    await cache.set(url, body, cacheTtlSec);
    return body;
  };
}
