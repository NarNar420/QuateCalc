import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryCache } from "./cache.js";
import { createFetchText, httpTransport } from "./fetcher.js";
import { createRateLimiter } from "./rateLimiter.js";
import { createRobotsChecker } from "./robots.js";

/**
 * Real-network integration: proves the pluggable transport + robots + cache +
 * rate-limit pipeline works over an actual HTTP connection (to a local server).
 * This is the same code path used for live supplier scraping — only the host
 * differs. (External hosts are blocked by the sandbox network policy.)
 */
let server: Server;
let base: string;
let pageHits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
    } else if (req.url === "/page") {
      pageHits++;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>שלום</h1><span class='price'>₪ 28.90</span></body></html>");
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function makeFetchText() {
  const fetchTextRaw = (url: string) => fetch(url).then((r) => r.text());
  return createFetchText({
    userAgent: "QuateCalcBot/test",
    rateLimiter: createRateLimiter({ minDelayMs: 0, concurrency: 4 }),
    robots: createRobotsChecker(fetchTextRaw, "QuateCalcBot/test"),
    cache: createMemoryCache(),
    respectRobots: true,
    transport: httpTransport(),
  });
}

describe("createFetchText over real HTTP", () => {
  it("fetches a page (robots-allowed) and serves the second call from cache", async () => {
    const fetchText = makeFetchText();
    const before = pageHits;

    const html1 = await fetchText(`${base}/page`);
    expect(html1).toContain("שלום");
    expect(html1).toContain("₪ 28.90");

    const html2 = await fetchText(`${base}/page`);
    expect(html2).toBe(html1);
    // second call hit the cache, not the server
    expect(pageHits).toBe(before + 1);
  });

  it("throws on a 4xx so the runner's health gate can react", async () => {
    const fetchText = makeFetchText();
    await expect(fetchText(`${base}/missing`)).rejects.toThrow(/404/);
  });
});
