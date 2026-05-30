import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimiter.js";

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("createRateLimiter", () => {
  it("runs same-host tasks one at a time, preserving FIFO order", async () => {
    const limiter = createRateLimiter({ minDelayMs: 0, concurrency: 5, sleep: () => Promise.resolve() });
    const order: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const make = (id: number) => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      order.push(id);
      inFlight--;
      return id;
    };

    const results = await Promise.all([
      limiter.schedule("host-a", make(1)),
      limiter.schedule("host-a", make(2)),
      limiter.schedule("host-a", make(3)),
    ]);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxInFlight).toBe(1); // serialized per host
  });

  it("never exceeds the global concurrency limit across hosts", async () => {
    const limiter = createRateLimiter({ minDelayMs: 0, concurrency: 2, sleep: () => Promise.resolve() });
    let inFlight = 0;
    let maxInFlight = 0;

    const make = () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      await tick();
      inFlight--;
    };

    await Promise.all([
      limiter.schedule("h1", make()),
      limiter.schedule("h2", make()),
      limiter.schedule("h3", make()),
      limiter.schedule("h4", make()),
    ]);

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("allows different hosts to run in parallel", async () => {
    const limiter = createRateLimiter({ minDelayMs: 0, concurrency: 5, sleep: () => Promise.resolve() });
    let inFlight = 0;
    let maxInFlight = 0;

    const make = () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      inFlight--;
    };

    await Promise.all([
      limiter.schedule("a", make()),
      limiter.schedule("b", make()),
      limiter.schedule("c", make()),
    ]);

    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("calls the injected sleep for inter-request delay", async () => {
    const sleeps: number[] = [];
    const limiter = createRateLimiter({
      minDelayMs: 1500,
      concurrency: 5,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    await limiter.schedule("a", async () => "x");
    await limiter.schedule("a", async () => "y");
    // give the trailing done()/sleep microtasks a chance to run
    await tick();
    expect(sleeps).toContain(1500);
  });
});
