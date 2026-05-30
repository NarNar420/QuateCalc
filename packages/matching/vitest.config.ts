import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The integration test (`match.test.ts`) needs DATABASE_URL to reach the seeded
 * Postgres. There is no dotenv dependency in this repo, so load the monorepo
 * root `.env` ourselves and expose it to the test runner. Existing shell env
 * vars win (we never overwrite them). If `.env` is absent, tests still run —
 * the integration case just fails fast with a clear "DATABASE_URL not found".
 */
function loadRootEnv(): Record<string, string> {
  const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export default defineConfig({
  test: {
    env: loadRootEnv(),
  },
});
