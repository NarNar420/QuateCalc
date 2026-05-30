/**
 * Per-host rate limiter. Enforces both a minimum delay between the *start* of
 * consecutive requests to the same host AND a global max concurrency. Pure
 * promise-queue, no dependencies, so it works the same in tests (set delay 0).
 */

export interface RateLimiterOptions {
  /** Minimum ms between consecutive request starts to the same host. */
  minDelayMs?: number;
  /** Max requests in flight at once (across all hosts). */
  concurrency?: number;
  /** Injectable sleep (tests pass a no-op / fake timer). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (defaults to Date.now). */
  now?: () => number;
}

export interface RateLimiter {
  schedule<T>(host: string, fn: () => Promise<T>): Promise<T>;
}

const DEFAULT_MIN_DELAY_MS = 1500;
const DEFAULT_CONCURRENCY = 2;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/**
 * Create a rate limiter. Options override env (`SCRAPER_MIN_DELAY_MS`,
 * `SCRAPER_CONCURRENCY`) which override the built-in defaults (1500ms, 2).
 */
export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const minDelayMs = opts.minDelayMs ?? envInt("SCRAPER_MIN_DELAY_MS", DEFAULT_MIN_DELAY_MS);
  const concurrency = Math.max(1, opts.concurrency ?? envInt("SCRAPER_CONCURRENCY", DEFAULT_CONCURRENCY));
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  let active = 0;
  const waiters: Array<() => void> = [];
  // Per-host serialization chain: tasks to the same host run one-at-a-time and
  // each holds the host lock for >= minDelayMs, guaranteeing request spacing.
  const hostTail = new Map<string, Promise<void>>();

  function acquireSlot(): Promise<void> {
    if (active < concurrency) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        active++;
        resolve();
      });
    });
  }

  function releaseSlot(): void {
    active--;
    const next = waiters.shift();
    if (next) next();
  }

  /**
   * Returns a promise that resolves when this task is allowed to start, plus a
   * `done` callback the task must call after `fn` completes to release the host.
   */
  function hostGate(host: string): { ready: Promise<void>; done: () => Promise<void> } {
    const prev = hostTail.get(host) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => {
      release = r;
    });
    const tail = prev.then(() => mine);
    hostTail.set(host, tail);
    const done = async (): Promise<void> => {
      // Hold the host for minDelayMs before letting the next queued task start.
      await sleep(minDelayMs);
      release();
      // Drop the entry once this task is the tail to avoid unbounded growth.
      if (hostTail.get(host) === tail) hostTail.delete(host);
    };
    return { ready: prev, done };
  }

  async function schedule<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const gate = hostGate(host);
    await gate.ready;
    await acquireSlot();
    try {
      return await fn();
    } finally {
      releaseSlot();
      void gate.done();
    }
  }

  return { schedule };
}
