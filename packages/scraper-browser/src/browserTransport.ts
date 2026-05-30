import type { Transport } from "@quatecalc/scraper-core";
import type { Browser, BrowserContext } from "playwright";
import { DEFAULT_UA, stealthInitScript } from "./stealth.js";

export interface BrowserTransportOptions {
  /** Force-headless (default true). Set false to debug locally. */
  headless?: boolean;
  /** Browser locale (default he-IL). */
  locale?: string;
  /** Timezone (default Asia/Jerusalem). */
  timezoneId?: string;
  /** Navigation timeout in ms (default 30000). */
  navigationTimeoutMs?: number;
  /** When to consider navigation done (default "domcontentloaded"). */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Optional CSS selector to wait for before reading HTML (e.g. "ul.products"). */
  waitForSelector?: string;
  /** Extra settle time for anti-bot interstitials to resolve, ms (default 0). */
  challengeWaitMs?: number;
  /** Proxy URL, e.g. "http://user:pass@host:port" — for IP rotation / geo. */
  proxy?: string;
}

export interface BrowserTransport {
  /** A scraper-core Transport: (url, userAgent) => Promise<html>. */
  fetchText: Transport;
  /** Tear down the shared browser. Always call when the run finishes. */
  close: () => Promise<void>;
}

/**
 * A Playwright-backed transport: launches a real Chromium (lazily, once),
 * renders each page (executing site JS, so it passes most Cloudflare-style
 * challenges), and returns the fully rendered HTML for cheerio to parse.
 *
 * Drop-in for `createFetchText({ transport })` — adapters are unchanged.
 *
 * NOTE: requires the Chromium binary (`pnpm --filter @quatecalc/scraper-browser
 * install-browser`) and outbound network to the target host.
 */
export function createBrowserTransport(opts: BrowserTransportOptions = {}): BrowserTransport {
  const {
    headless = true,
    locale = "he-IL",
    timezoneId = "Asia/Jerusalem",
    navigationTimeoutMs = 30_000,
    waitUntil = "domcontentloaded",
    waitForSelector,
    challengeWaitMs = 0,
    proxy,
  } = opts;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  async function ensureContext(userAgent: string): Promise<BrowserContext> {
    if (context) return context;
    // Dynamic import keeps Playwright (and any binary requirement) out of the
    // module-load path for callers that never actually scrape live.
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      ...(proxy ? { proxy: { server: proxy } } : {}),
    });
    context = await browser.newContext({
      userAgent: userAgent || DEFAULT_UA,
      locale,
      timezoneId,
      viewport: { width: 1366, height: 900 },
    });
    await context.addInitScript(stealthInitScript());
    return context;
  }

  const fetchText: Transport = async (url, userAgent) => {
    const ctx = await ensureContext(userAgent);
    const page = await ctx.newPage();
    try {
      const res = await page.goto(url, { waitUntil, timeout: navigationTimeoutMs });
      if (challengeWaitMs > 0) await page.waitForTimeout(challengeWaitMs);
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: navigationTimeoutMs }).catch(() => {
          /* fall through: return whatever rendered */
        });
      }
      const status = res?.status() ?? 0;
      // Surface hard blocks so the runner's health gate can react.
      if (status >= 400) {
        throw new Error(`Browser navigation got HTTP ${status} for ${url}`);
      }
      return await page.content();
    } finally {
      await page.close().catch(() => {});
    }
  };

  const close = async () => {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    context = null;
    browser = null;
  };

  return { fetchText, close };
}
