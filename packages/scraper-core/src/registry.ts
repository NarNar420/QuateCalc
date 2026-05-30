import type { ScraperAdapter } from "@quatecalc/contracts";

/**
 * Process-wide registry of supplier adapters. Adapters register themselves
 * (see each adapter package's `register*Adapter()`), and the runner / ops
 * tooling looks them up by `supplierKey`.
 */
const adapters = new Map<string, ScraperAdapter>();

/** Register (or replace) an adapter keyed by its `supplierKey`. */
export function registerAdapter(adapter: ScraperAdapter): void {
  adapters.set(adapter.supplierKey, adapter);
}

/** Look up a registered adapter by key. */
export function getAdapter(key: string): ScraperAdapter | undefined {
  return adapters.get(key);
}

/** All registered adapters, in insertion order. */
export function listAdapters(): ScraperAdapter[] {
  return [...adapters.values()];
}

/** Test helper: drop all registrations. */
export function clearAdapters(): void {
  adapters.clear();
}
