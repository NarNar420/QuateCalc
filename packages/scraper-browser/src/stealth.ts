/**
 * A small init script injected into every page before site JS runs, masking the
 * most common headless-Chromium tells (navigator.webdriver, empty plugins/
 * languages, missing window.chrome). This is deliberately lightweight — it
 * defeats trivial checks and, combined with a real Chromium + realistic
 * UA/locale/timezone, passes most "managed challenge" anti-bot setups. Very
 * aggressive protections may still require residential proxies or a scraping
 * API (see README — the transport is pluggable).
 *
 * Kept as a pure string so it can be unit-tested without launching a browser.
 */
export function stealthInitScript(): string {
  return `
    (() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        if (!window.chrome) { window.chrome = { runtime: {} }; }
        const origQuery = window.navigator.permissions && window.navigator.permissions.query;
        if (origQuery) {
          window.navigator.permissions.query = (p) =>
            p && p.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission })
              : origQuery(p);
        }
      } catch (_e) { /* best effort */ }
    })();
  `;
}

/** Realistic desktop Chrome User-Agent used when the caller doesn't supply one. */
export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
