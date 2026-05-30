import Redis from "ioredis";

/** Minimal string KV cache used to avoid re-fetching pages within a TTL. */
export interface PageCache {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ttlSec: number): Promise<void>;
}

export interface PageCacheOptions {
  /** Redis connection string; falls back to env REDIS_URL. */
  redisUrl?: string;
  /** Key prefix to namespace this cache. */
  prefix?: string;
}

/** Always-available in-memory cache (used as the fallback and in tests). */
export function createMemoryCache(): PageCache {
  const store = new Map<string, { val: string; expiresAt: number }>();
  return {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expiresAt !== 0 && hit.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return hit.val;
    },
    async set(key, val, ttlSec) {
      const expiresAt = ttlSec > 0 ? Date.now() + ttlSec * 1000 : 0;
      store.set(key, { val, expiresAt });
    },
  };
}

/**
 * Page cache that prefers Redis but degrades GRACEFULLY to an in-memory Map if
 * Redis is missing or unreachable. Never throws on a miss or when Redis is
 * down — caching is best-effort and must not break a scrape.
 */
export function createPageCache(opts: PageCacheOptions = {}): PageCache {
  const url = opts.redisUrl ?? process.env.REDIS_URL;
  const prefix = opts.prefix ?? "scraper:page:";
  const memory = createMemoryCache();

  if (!url) return memory;

  let redis: Redis | null = null;
  try {
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Swallow connection errors so an unavailable Redis never crashes the run.
    redis.on("error", () => {
      /* fall back to memory */
    });
  } catch {
    return memory;
  }

  const k = (key: string): string => `${prefix}${key}`;

  return {
    async get(key) {
      try {
        const v = await redis!.get(k(key));
        if (v !== null) return v;
      } catch {
        /* ignore Redis errors, try memory */
      }
      return memory.get(key);
    },
    async set(key, val, ttlSec) {
      try {
        if (ttlSec > 0) await redis!.set(k(key), val, "EX", ttlSec);
        else await redis!.set(k(key), val);
      } catch {
        /* ignore Redis errors */
      }
      // Mirror into memory so a later Redis outage still serves recent pages.
      await memory.set(key, val, ttlSec);
    },
  };
}
