export {
  registerAdapter,
  getAdapter,
  listAdapters,
  clearAdapters,
} from "./registry.js";

export {
  createRateLimiter,
  type RateLimiter,
  type RateLimiterOptions,
} from "./rateLimiter.js";

export {
  createRobotsChecker,
  type RobotsChecker,
  type FetchText,
} from "./robots.js";

export {
  createPageCache,
  createMemoryCache,
  type PageCache,
  type PageCacheOptions,
} from "./cache.js";

export {
  createFetchText,
  httpTransport,
  RobotsDisallowedError,
  type FetcherDeps,
  type Transport,
} from "./fetcher.js";

export {
  parsePrice,
  rawToStagedProduct,
  type NormalizeContext,
} from "./normalize.js";

export {
  runScrape,
  type RunnerDeps,
  type RunScrapeOptions,
} from "./runner.js";
