import robotsParser from "robots-parser";

/** Fetches a URL and returns its body text (the fetcher passes its own impl). */
export type FetchText = (url: string) => Promise<string>;

export interface RobotsChecker {
  isAllowed(url: string): Promise<boolean>;
}

/**
 * robots.txt gate. Fetches `/robots.txt` per host once (cached), then consults
 * it for every URL. Policy:
 *  - If robots.txt is fetched: respect it (default allow when a path is unlisted).
 *  - If robots.txt CANNOT be fetched (network/parse error): fail OPEN (allow),
 *    since absence of a robots.txt conventionally means "no restrictions".
 *
 * `fetchTextRaw` should be a plain fetch (NOT the robots-guarded fetcher, to
 * avoid recursion) — typically rate-limited so we stay polite even here.
 */
export function createRobotsChecker(fetchTextRaw: FetchText, userAgent: string): RobotsChecker {
  // host -> parsed robots (or null when it couldn't be fetched => fail open).
  const cache = new Map<string, Promise<ReturnType<typeof robotsParser> | null>>();

  function load(robotsUrl: string): Promise<ReturnType<typeof robotsParser> | null> {
    let pending = cache.get(robotsUrl);
    if (!pending) {
      pending = fetchTextRaw(robotsUrl)
        .then((body) => robotsParser(robotsUrl, body))
        .catch(() => null);
      cache.set(robotsUrl, pending);
    }
    return pending;
  }

  async function isAllowed(url: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const robots = await load(robotsUrl);
    if (!robots) return true; // fail open: robots.txt unavailable
    const allowed = robots.isAllowed(url, userAgent);
    // robots-parser returns undefined when there's no matching rule => allowed.
    return allowed !== false;
  }

  return { isAllowed };
}
