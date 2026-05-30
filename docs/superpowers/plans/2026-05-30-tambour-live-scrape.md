# Live Scrape (one category end-to-end) Implementation Plan — ACE (pivoted from Tambour)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PIVOT (2026-05-30, post-recon):** Tasks 1–3 done as written. Recon (Task 4) proved
> **Tambour has no online prices** → pivoted to **ACE** (real priced Magento store).
> Tasks 5–9 now target the **ACE** adapter (`packages/scraper-adapters/src/ace/*`), not
> Tambour. Key ACE deltas (see `docs/superpowers/recon/2026-05-30-supplier-recon.md`):
> Knockout-rendered → **browser transport required**; **page-1-only** (robots disallows
> `/*?`, pagination is `?p=2`); category discovery returns the done-bar category
> `/tools-paint-affixing`; current-price = `.priceNum`(+`.ag`) NOT inside `.old-price`;
> protocol-relative product URLs; SKU = `data-sku` on `a.product-item-link`.

**Goal:** Pull real prices from the live Tambour site for one product category, promote them to the catalog through the health gate, and prove the full match → quote → Excel pipeline on that real data.

**Architecture:** The scraper machinery (runner, browser transport, adapter contract) already exists and is green against fixtures. This plan (1) adds an additive, default-off category filter so a run can be scoped to one category, (2) does live recon to learn Tambour's real HTML, (3) rewrites the Tambour adapter's selectors/parse to match reality, (4) replaces fixtures with trimmed real captures, (5) runs one live browser scrape, and (6) verifies end-to-end. Only the Tambour adapter folder + worker + one additive runner option change.

**Tech Stack:** TypeScript (ESM, NodeNext), pnpm workspaces, vitest, cheerio, Playwright (Chromium), Prisma/Postgres, Next.js (web, untouched here).

**Spec:** `docs/superpowers/specs/2026-05-30-tambour-live-scrape-design.md`

**Branch:** continue on `chore/matching-vitest-env`. Do NOT merge until the done bar is met and the user approves.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `packages/scraper-core/src/runner.ts` | add additive `categoryFilter` option (default = all) | 1 |
| `packages/scraper-core/src/runner.test.ts` | test the filter + prove default unchanged | 1 |
| `apps/worker/src/refresh.ts` | `--category` arg → `categoryFilter`; update browser `waitForSelector` | 2, 5 |
| `docs/superpowers/recon/2026-05-30-tambour-recon.md` | recorded recon findings (the data contract for tasks 5–6) | 4 |
| `packages/scraper-adapters/src/tambour/selectors.ts` | real selectors (or structured-data keys) | 5 |
| `packages/scraper-adapters/src/tambour/parse.ts` | parse real markup (structure already correct; selector-driven) | 5 |
| `packages/scraper-adapters/src/tambour/__fixtures__/*.html` | trimmed, sanitized real captures | 6 |
| `packages/scraper-adapters/src/tambour/parse.test.ts` | assert against real structure | 6 |
| `packages/scraper-adapters/src/tambour/adapter.test.ts` | assert against real structure | 6 |
| `apps/worker/src/context.ts` | Tambour fixture URL→file map, if real paths differ | 6 |
| `docs/WORKLOG.md` | append the work entry | 9 |

**Recon gating:** Tasks 1–3 are deterministic and can be done now. Tasks 5–6 depend on the real HTML recorded in Task 4's findings file. Tasks 7–8 require a successful live fetch (network + Chromium + Cloudflare cleared); if recon (Task 4) shows a hard block, STOP and report per the spec's recon gate — do not fabricate fixtures or fake a pass.

---

## Task 1: Additive `categoryFilter` in the runner

**Files:**
- Modify: `packages/scraper-core/src/runner.ts` (`RunScrapeOptions` + the category list)
- Test: `packages/scraper-core/src/runner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/scraper-core/src/runner.test.ts` (inside the existing `describe("runScrape", ...)` block, before its closing `});`):

```ts
  it("applies categoryFilter to limit which categories are scraped", async () => {
    // Adapter exposing TWO categories, each yielding one product.
    const twoCatAdapter: ScraperAdapter = {
      supplierKey: "fake",
      supplierName: "Fake Supplier",
      baseUrl: "https://www.example.com",
      async listCategories() {
        return [
          { key: "paints", label: "צבעים", url: "https://www.example.com/c/paints" },
          { key: "tools", label: "כלים", url: "https://www.example.com/c/tools" },
        ];
      },
      async *scrapeCategory(cat) {
        yield {
          name: `מוצר ${cat.key}`,
          priceRaw: "₪ 10.00",
          url: `https://www.example.com/p/${cat.key}`,
        };
      },
    };

    const { deps, staged } = makeFakeDeps();
    const result = await runScrape(twoCatAdapter, "center", {
      deps,
      ctx: makeCtx(),
      categoryFilter: (c) => c.key === "paints",
    });

    expect(result.productCount).toBe(1);
    expect((staged[0] as { name: string }).name).toBe("מוצר paints");
  });

  it("scrapes all categories when no categoryFilter is given (unchanged default)", async () => {
    const twoCatAdapter: ScraperAdapter = {
      supplierKey: "fake",
      supplierName: "Fake Supplier",
      baseUrl: "https://www.example.com",
      async listCategories() {
        return [
          { key: "paints", label: "צבעים", url: "https://www.example.com/c/paints" },
          { key: "tools", label: "כלים", url: "https://www.example.com/c/tools" },
        ];
      },
      async *scrapeCategory(cat) {
        yield {
          name: `מוצר ${cat.key}`,
          priceRaw: "₪ 10.00",
          url: `https://www.example.com/p/${cat.key}`,
        };
      },
    };

    const { deps } = makeFakeDeps();
    const result = await runScrape(twoCatAdapter, "center", { deps, ctx: makeCtx() });
    expect(result.productCount).toBe(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quatecalc/scraper-core test -- runner`
Expected: the `categoryFilter` test FAILS (productCount 2, expected 1) because the option is ignored. The "unchanged default" test passes already.

- [ ] **Step 3: Add the option and apply it**

In `packages/scraper-core/src/runner.ts`, add the field to `RunScrapeOptions` (after `maxNullPriceRate`):

```ts
  /** Fraction of unparseable prices above which the run is considered broken. */
  maxNullPriceRate?: number;
  /**
   * Optional predicate to limit which discovered categories are scraped.
   * Default (undefined) scrapes every category — existing behavior.
   */
  categoryFilter?: (category: CategoryRef) => boolean;
```

Then, immediately after the `listCategories` try/catch block (after the closing `}` of that catch, before `for (const category of categories)`), insert:

```ts
  if (options.categoryFilter) {
    const before = categories.length;
    categories = categories.filter(options.categoryFilter);
    ctx.log("info", `categoryFilter kept ${categories.length}/${before} categories`);
  }
```

`CategoryRef` is already imported in `runner.ts` — no new import needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quatecalc/scraper-core test -- runner`
Expected: PASS (all runner tests, including both new ones).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @quatecalc/scraper-core typecheck
git add packages/scraper-core/src/runner.ts packages/scraper-core/src/runner.test.ts
git commit -m "feat(scraper-core): additive categoryFilter option on runScrape"
```
Expected: typecheck clean; commit succeeds.

---

## Task 2: `--category` arg in the worker

**Files:**
- Modify: `apps/worker/src/refresh.ts` (`Args`, `parseArgs`, `main` → pass `categoryFilter`)

> The worker has no unit test harness for arg parsing (its only test is the hermetic e2e). Verify this task by typecheck + a dry `--help`-style run that prints the parsed mode. Keep the change minimal.

- [ ] **Step 1: Add `category` to the `Args` interface**

In `apps/worker/src/refresh.ts`, extend `interface Args`:

```ts
interface Args {
  supplier: string;
  region: ScrapeRegion;
  live: boolean;
  browser: boolean;
  proxy?: string;
  category?: string;
}
```

- [ ] **Step 2: Parse the flag**

In `parseArgs`, add a local and a case. After `let proxy: string | undefined;` add:

```ts
  let category: string | undefined;
```

Add a new branch in the arg loop (after the `--proxy` branch):

```ts
    else if (a === "--category") category = argv[++i];
```

And include it in the returned object:

```ts
  return { supplier, region: RegionSchema.parse(region), live, browser, proxy, category };
```

- [ ] **Step 3: Build a categoryFilter and pass it to runScrape**

In `main`, replace the single line:

```ts
    const result = await runScrape(adapter, args.region, { buildContext });
```

with:

```ts
    const categoryFilter = args.category
      ? (c: { key: string; label: string; url: string }) =>
          c.key === args.category ||
          c.label.includes(args.category!) ||
          c.url.includes(args.category!)
      : undefined;

    const result = await runScrape(adapter, args.region, { buildContext, categoryFilter });
```

(The inline param type matches `CategoryRef`'s shape; no extra import needed. If you prefer, import `CategoryRef` from `@quatecalc/contracts` and annotate `(c: CategoryRef)`.)

Also update the mode log line so the scope is visible — change:

```ts
  console.log(`Refreshing "${adapter.supplierKey}" region=${args.region} mode=${mode}...`);
```

to:

```ts
  console.log(
    `Refreshing "${adapter.supplierKey}" region=${args.region} mode=${mode}` +
      `${args.category ? ` category=${args.category}` : ""}...`,
  );
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @quatecalc/worker typecheck`
Expected: clean.

- [ ] **Step 5: Smoke-test arg parsing offline (fixtures, scoped)**

Run:
```bash
pnpm --filter @quatecalc/worker refresh -- --fixtures --supplier tambour --region center --category paints
```
Expected: log shows `... mode=FIXTURES category=paints...` and `categoryFilter kept 1/3 categories`, then a successful fixture run (paints only). This proves the flag threads through end-to-end against the still-current fixtures.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/refresh.ts
git commit -m "feat(worker): --category flag scopes a refresh to one category"
```

---

## Task 3: Install Playwright Chromium (local, manual gate)

**Files:** none (environment setup).

- [ ] **Step 1: Install the browser binary**

Run: `pnpm --filter @quatecalc/scraper-browser install-browser`
Expected: Chromium downloads and installs.

- [ ] **Step 2: Handle a blocked download**

If the download fails (CDN blocked / offline), STOP. Report to the user with the exact error and these options: retry on a permissive network, set `PLAYWRIGHT_DOWNLOAD_HOST` to a mirror, or install Chromium manually (`npx playwright install chromium`). Do not proceed to live tasks until this succeeds. No commit for this task.

---

## Task 4: Recon — capture & record real Tambour HTML (investigative gate)

**Files:**
- Create: `docs/superpowers/recon/2026-05-30-tambour-recon.md` (the findings = data contract for Tasks 5–6)
- Scratch (NOT committed): raw HTML under `$CLAUDE_JOB_DIR/tmp`

- [ ] **Step 1: Check robots.txt first**

Run: `node -e "fetch('https://www.tambour.co.il/robots.txt').then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error('ERR',e.message))"`
Record in the findings file whether `/shop/` and `/product-category/` are allowed. If they are **disallowed**, STOP and report: the polite run will return empty and the done bar is unreachable without a ToS decision (spec §Error handling). Do not disable `SCRAPER_RESPECT_ROBOTS`.

- [ ] **Step 2: Capture the shop page + one category via the browser transport**

Create a scratch script `$CLAUDE_JOB_DIR/tmp/recon.mjs`:

```js
import { createBrowserTransport } from "@quatecalc/scraper-browser";
import { writeFileSync } from "node:fs";

const bt = createBrowserTransport({
  waitForSelector: "ul.products, ul.product-categories, li.product, main",
  challengeWaitMs: 3000,
});
try {
  for (const [name, url] of [
    ["shop", "https://www.tambour.co.il/shop/"],
    // adjust this path if the shop page reveals a different real category URL:
    ["category", "https://www.tambour.co.il/product-category/paints/"],
  ]) {
    const html = await bt.fetchText(url, "QuateCalcBot/0.1 (+mailto:contact@example.com)");
    writeFileSync(`${process.env.CLAUDE_JOB_DIR}/tmp/tambour-${name}.html`, html);
    console.log(name, url, "bytes:", html.length);
  }
} finally {
  await bt.close();
}
```

Run: `node $CLAUDE_JOB_DIR/tmp/recon.mjs`
Expected: two files written, non-trivial byte counts. (Run from the repo root so the workspace import resolves; if it cannot resolve, run via `pnpm --filter @quatecalc/scraper-browser exec node ...` or place the script in `apps/worker` and run with its resolver.)

- [ ] **Step 3: Detect a Cloudflare block**

Grep the captured shop HTML for challenge markers:

```bash
grep -il "cf-challenge\|Just a moment\|cf_chl\|Checking your browser\|Enable JavaScript and cookies" "$CLAUDE_JOB_DIR/tmp/tambour-shop.html"
```
If matched (or byte count is tiny / no product markup), the stealth browser did NOT clear Cloudflare. STOP and report options (raise `challengeWaitMs`, tune `stealthInitScript`, use `--proxy`). Do not proceed.

- [ ] **Step 4: Check for structured data (Approach A's gate)**

```bash
grep -o 'application/ld+json' "$CLAUDE_JOB_DIR/tmp/tambour-category.html" | head
node -e "fetch('https://www.tambour.co.il/wp-json/wc/store/v1/products?per_page=3').then(r=>console.log(r.status)).catch(e=>console.error('ERR',e.message))"
```
Record: is there a `"@type":"Product"` JSON-LD block on the listing? Does the Store API return 200 JSON? If structured data is clearly cleaner than theme CSS, note "use structured data" — Task 5 then parses that instead of CSS selectors.

- [ ] **Step 5: Record findings**

Inspect the captured HTML (open it / grep for class names) and write `docs/superpowers/recon/2026-05-30-tambour-recon.md` filling EVERY field below with the real observed values. These are the inputs Task 5 uses:

```markdown
# Tambour recon — 2026-05-30
- Captured from: <urls>, via browser transport. Cloudflare cleared: yes/no.
- robots.txt allows /shop/ + /product-category/: yes/no.
- Structured data: JSON-LD Product present: yes/no. Store API 200: yes/no. Decision: CSS | structured-data.

## Category discovery (shop page)
- Category tile link selector: <css>
- Category label node (inside tile): <css or "anchor text">
- Count-badge pattern to strip: <regex or "none">
- Real category URL example: <url>

## Product listing (category page)
- Product card selector: <css>
- Name selector: <css>
- Price block selector (current amount): <css> ; sale markup: <del>/<ins>? <notes>
- Unit/size selector: <css or "none">
- Product link selector: <css>
- SKU location: <attr name on which element, or "none on listing">

## Pagination
- Next-page link selector: <css>
- Page URL pattern: <e.g. /product-category/paints/page/2/>

## Grid-ready signal (for browser waitForSelector)
- Selector that exists only once products have rendered: <css>
```

- [ ] **Step 6: Commit the findings (recon HTML stays uncommitted)**

```bash
git add docs/superpowers/recon/2026-05-30-tambour-recon.md
git commit -m "docs(recon): real Tambour HTML structure findings"
```

---

## Task 5: Rewrite Tambour selectors + parse to match reality

**Files:**
- Modify: `packages/scraper-adapters/src/tambour/selectors.ts`
- Modify: `packages/scraper-adapters/src/tambour/parse.ts` (only if structure/logic differs from the current WooCommerce shape)
- Modify: `apps/worker/src/refresh.ts` (browser `waitForSelector`)

> The current `parse.ts` (cheerio-based: `parseCategoryList`, `parseProducts`, `parseNextPageUrl`) is already structured for WooCommerce. If recon's decision is "CSS" and Tambour is standard WooCommerce, you likely only edit `selectors.ts` constants. Touch `parse.ts` only where the real DOM differs (e.g. the label node, sale-price node, or SKU location recorded in recon). If recon's decision is "structured-data", replace the bodies of `parseCategoryList`/`parseProducts` to read the JSON-LD/Store-API payload while keeping the SAME function signatures and return types (`CategoryRef[]` / `RawProduct[]`).

- [ ] **Step 1: Update `selectors.ts` from the recon findings**

Set each constant in `packages/scraper-adapters/src/tambour/selectors.ts` to the real value recorded in `docs/superpowers/recon/2026-05-30-tambour-recon.md` (`categoryLink`, `productCard`, `productName`, `productPrice`, `productUnit`, `productLink`, `productSkuAttr`, `nextPage`). Keep the file's structure and doc comments; change only the selector strings to match observed markup.

- [ ] **Step 2: Reconcile `parse.ts` with the real DOM**

Compare the recon findings to `parse.ts`:
- Category label: the current code reads `.woocommerce-loop-category__title` and strips a `(\d+)` badge (parse.ts:40-44). If recon shows a different label node or badge format, update that selector/regex.
- Sale price: current code takes the LAST `.amount` (parse.ts:68-69). If recon shows sale markup differs (e.g. current amount is in `ins .amount`), adjust to select the current price node explicitly.
- SKU: current code reads the `productSkuAttr` data-attribute on any descendant (parse.ts:76-78). If recon shows SKU is absent on listings, leave `sku` undefined (the contract allows it) — do NOT invent one.

Make only the edits the recon findings require. Do not change function names, parameters, or return types.

- [ ] **Step 3: Update the browser grid-ready selector in the worker**

In `apps/worker/src/refresh.ts`, set `waitForSelector` (currently `"ul.products, ul.product-categories, li.product"`) to the grid-ready selector recorded in recon Step 5. Keep `challengeWaitMs` (raise to `3000` if recon needed extra settle time to clear Cloudflare).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @quatecalc/scraper-adapters typecheck && pnpm --filter @quatecalc/worker typecheck`
Expected: clean. (Tests come in Task 6, after fixtures reflect reality — the old fixtures may not match new selectors yet, so do not run adapter tests here.)

- [ ] **Step 5: Commit**

```bash
git add packages/scraper-adapters/src/tambour/selectors.ts packages/scraper-adapters/src/tambour/parse.ts apps/worker/src/refresh.ts
git commit -m "feat(tambour): selectors + parse match real site (recon-driven)"
```

---

## Task 6: Replace fixtures with real captures + fix offline tests

**Files:**
- Replace: `packages/scraper-adapters/src/tambour/__fixtures__/shop.html`, `products-page1.html`, `products-page2.html`
- Modify: `packages/scraper-adapters/src/tambour/parse.test.ts`
- Modify: `packages/scraper-adapters/src/tambour/adapter.test.ts`
- Modify (if real paths differ): `apps/worker/src/context.ts` (Tambour fixture map)

- [ ] **Step 1: Build trimmed, sanitized fixtures from the captures**

From the raw captures in `$CLAUDE_JOB_DIR/tmp`, produce fixtures that keep the real product/category/pagination markup but are trimmed for tests:
- `shop.html`: keep the category tiles container with ~3 real categories.
- `products-page1.html`: keep the product grid with ~3 real product cards (include one on sale if the category has one) AND the next-page link.
- `products-page2.html`: keep ~2 real product cards and NO next-page link (last page).
- Strip: `<script>`/tracking/analytics, cookie banners, inline base64 images, any session tokens or personal data. Add an HTML comment at the top of each: `<!-- captured from <url> on 2026-05-30; trimmed for tests -->`.

- [ ] **Step 2: Rewrite `parse.test.ts` to the real values**

Update `packages/scraper-adapters/src/tambour/parse.test.ts` so the expected `key`/`label`/`url`/`name`/`priceRaw`/`sku` match the REAL products kept in the fixtures. Preserve the four test intents:
1. `parseCategoryList` returns the real categories (correct count, first category's `{key,label,url}`).
2. `parseProducts` extracts name, price, sku (if present), absolute url, and `categoryPath`.
3. The sale-price case asserts the CURRENT price (only if a sale product was kept; otherwise delete this `it` and note why in the test file).
4. `parseNextPageUrl` returns page-2 url from page 1 and `null` from page 2.

Use the real strings from the fixtures — do not keep the old invented `SUP-W-18` / `289.00` values unless they happen to be real.

- [ ] **Step 3: Rewrite `adapter.test.ts` to the real values**

Update `packages/scraper-adapters/src/tambour/adapter.test.ts`:
- The `fixtureCtx` URL→file `map` keys must match the REAL category path from recon (e.g. if the real category is `/product-category/<slug>/`, use that). Update both the `/shop/` entry (if changed) and the category + page-2 entries.
- `listCategories` expectation: the real category keys in order.
- `scrapeCategory` expectation: total product count across the two fixture pages, all stamped `region: "center"`, and one real sku/name present.

- [ ] **Step 4: Update the worker fixture map if paths changed**

If the real category path differs from the modeled `/product-category/paints/`, update the `tambour` entry in `apps/worker/src/context.ts` `FIXTURE_SUPPLIERS` map so offline `--fixtures` runs still resolve. Keep keys in sync with the fixture filenames.

- [ ] **Step 5: Run the offline tests**

Run: `pnpm --filter @quatecalc/scraper-adapters test`
Expected: PASS — all Tambour parse + adapter tests green against the real-capture fixtures, fully offline. ACE tests untouched and still green.

- [ ] **Step 6: Verify the fixture-mode worker e2e still passes**

Run: `pnpm --filter @quatecalc/worker test`
Expected: the hermetic e2e (ace + tambour) passes. If the tambour fixture path changed, the e2e fixture wiring (Task 6 Step 4) must have been updated accordingly.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper-adapters/src/tambour/__fixtures__ packages/scraper-adapters/src/tambour/parse.test.ts packages/scraper-adapters/src/tambour/adapter.test.ts apps/worker/src/context.ts
git commit -m "test(tambour): real-capture fixtures + offline tests assert real structure"
```

---

## Task 7: Live run — one category → promote

**Files:** none (runtime). Requires Postgres + Redis up and Chromium installed.

- [ ] **Step 1: Confirm infra + env**

```bash
docker ps --format "{{.Names}} {{.Status}}"
```
Expected: `quatecalc-postgres` and `quatecalc-redis` both `Up ... (healthy)`. Ensure `DATABASE_URL` is exported (or in `.env`) and matches the running Postgres.

- [ ] **Step 2: Run the live browser scrape, scoped to the recon category**

```bash
pnpm --filter @quatecalc/worker refresh -- --live --browser --supplier tambour --region center --category <recon-category-key>
```
Expected log: `mode=LIVE+BROWSER category=<key>`, `categoryFilter kept 1/N categories`, `tambour: discovered N categories`, then a JSON result with `status: "success"` (or `"partial"`), `productCount > 0`, `nullPriceRate <= 0.5`, `promoted: true`.

- [ ] **Step 3: Interpret a failure honestly**

- `status: "failed"`, `notes: "no products scraped"` → selectors don't match the live DOM (revisit Task 5) OR Cloudflare returned a challenge page (revisit Task 3/4). The catalog was left unchanged (health gate) — that is correct, not a regression.
- `notes: nullPriceRate ...` → price selector is wrong; the cards parsed but prices didn't. Fix the price selector (Task 5) and re-run.
- HTTP ≥400 thrown → hard block; report, consider `--proxy`.

Do not edit fixtures to mask a live failure — fixtures are for offline tests; the live run must succeed on its own.

- [ ] **Step 4: No commit** (runtime action; DB state only).

---

## Task 8: End-to-end verify — match → quote → Excel on real data

**Files:**
- Create (scratch, NOT committed): `$CLAUDE_JOB_DIR/tmp/e2e-verify.mjs`

- [ ] **Step 1: Confirm real Tambour rows are current**

Use the matching package against a real **paint** term (paints are Tambour's domain — a building-material term like מלט will not overlap). Create `$CLAUDE_JOB_DIR/tmp/e2e-verify.mjs`:

```js
import { matchLines } from "@quatecalc/matching";
import { computeQuote } from "@quatecalc/pricing";
import { exportQuote } from "@quatecalc/export";
import { writeFileSync } from "node:fs";

// Use a paint term that should overlap a real scraped Tambour product.
// Replace "סופרקריל" with a token actually present in the scraped category if needed.
const lines = [{ id: "1", rawText: "סופרקריל לבן", quantity: 4, rawUnit: "ליטר" }];

const matched = await matchLines(lines, { region: "center" });
console.log("MATCH:", JSON.stringify(matched, null, 2));
const m = matched[0];
if (!m || m.status === "no_match" || !m.selectedProduct) {
  console.error("FAIL: no real product matched — check what was scraped / pick a real token");
  process.exit(2);
}
console.log("Matched product:", m.selectedProduct.name, m.selectedProduct.price ?? m.unitPrice);
```

Run: `node $CLAUDE_JOB_DIR/tmp/e2e-verify.mjs` (from repo root, `DATABASE_URL` exported).
Expected: a real Tambour product name + price printed; not `no_match`.

- [ ] **Step 2: Build a quote and export it**

Extend the script after the match check (append before EOF), using the real matched line to build a quote. Use the project's actual `computeQuote` and `exportQuote` signatures — confirm them in `packages/pricing/src/calc.ts` and `packages/export/src/exportQuote.ts` before writing this block, then:

```js
// Shape the matched results into the QuoteInput your computeQuote expects
// (see packages/pricing/src/pricing.test.ts for the exact input shape),
// then:
const quote = computeQuote(quoteInput);          // quoteInput per pricing tests
console.log("GRAND TOTAL ₪:", quote.totals.grandTotal);
const { xlsx, csv } = await exportQuote(quote);  // per export tests' usage
writeFileSync(`${process.env.CLAUDE_JOB_DIR}/tmp/quote.xlsx`, xlsx);
writeFileSync(`${process.env.CLAUDE_JOB_DIR}/tmp/quote.csv`, csv, "utf8");
console.log("Wrote quote.xlsx + quote.csv");
```

Run the script again.
Expected: a positive grand total computed from the REAL scraped price (incl. 18% VAT), and `quote.xlsx` + `quote.csv` written.

- [ ] **Step 3: Validate the XLSX opens**

```bash
node -e "import('exceljs').then(async ({default:E})=>{const wb=new E.Workbook();await wb.xlsx.readFile(process.env.CLAUDE_JOB_DIR+'/tmp/quote.xlsx');console.log('sheets:',wb.worksheets.map(w=>w.name));})"
```
Expected: workbook reads back without error; at least one worksheet listed. This is the done bar: real Tambour price → matched → quoted → valid Excel.

- [ ] **Step 4: No commit** (verification only; scratch files stay in tmp).

---

## Task 9: Final gates, WORKLOG, and stop-for-review

**Files:**
- Modify: `docs/WORKLOG.md`

- [ ] **Step 1: Full repo verification**

```bash
pnpm -r typecheck
pnpm -r test
```
Expected: all packages typecheck; all tests green cold (the matching vitest config already loads `.env`).

- [ ] **Step 2: Append the WORKLOG entry**

Add to the bottom of the relevant section in `docs/WORKLOG.md`, following AGENTS.md §4:

```markdown
### [2026-05-30] Tambour live scrape — one category end-to-end  (agent: claude-code/opus)
- **Task:** prove the price-acquisition pipeline against the real Tambour site for one category.
- **Paths:** `packages/scraper-adapters/src/tambour/*`, `packages/scraper-core/src/runner.ts` (additive `categoryFilter`), `apps/worker/src/refresh.ts` (`--category`).
- **Public API:** `runScrape(..., { categoryFilter })`; worker `--category <key>`. Tambour adapter unchanged in signature.
- **Tests:** scraper-core +2 (categoryFilter on/off); tambour parse/adapter rewritten to real-capture fixtures (offline); worker e2e green.
- **Verified:** live `--live --browser` scrape of one Tambour category promoted N real products through the health gate; match→quote→Excel produced a real ₪ total + valid XLSX.
- **Commit:** <hashes>.
- **Status:** ✅ done (one category). ⚠️ full catalog + ACE live still pending.
```

If a blocker stopped the run (Cloudflare/robots/Chromium), log it honestly as ⚠️ blocked with the reason instead of claiming done.

- [ ] **Step 3: Commit**

```bash
git add docs/WORKLOG.md
git commit -m "docs(worklog): Tambour live scrape — one category end-to-end"
```

- [ ] **Step 4: Stop and report to the user**

Summarize: what was scraped (counts, sample product+price), the recon decision (CSS vs structured-data), any anti-bot notes, and the generated quote total. Then ask whether to (a) push the branch + open a PR, or (b) extend to the full catalog / ACE. Do NOT merge to `main` without approval (AGENTS.md §3).

---

## Self-Review

**Spec coverage:**
- Done bar (one category, real price → quote → Excel) → Tasks 7–8. ✓
- Recon + structured-data gate → Task 4 (Steps 3–4). ✓
- One-category scoping (the spec's necessary code exception) → Tasks 1–2. ✓
- `refresh.ts` waitForSelector fix → Task 5 Step 3. ✓
- robots.txt block as a real stop condition → Task 4 Step 1. ✓
- paint-term verify caveat → Task 8 Step 1. ✓
- Fixtures from real captures, offline tests → Task 6. ✓
- Health-gate safety (no new code) → relied on in Task 7 Step 3. ✓
- Verification gates incl. scraper-core test → Task 9 Step 1. ✓
- WORKLOG per AGENTS.md §4 → Task 9 Step 2. ✓

**Placeholder scan:** Task 8 Step 2 references `quoteInput` / exact `computeQuote`/`exportQuote` usage "per pricing/export tests" rather than inlining — this is deliberate: the verify script is scratch (not committed) and the exact input shape must be read from `packages/pricing/src/pricing.test.ts` and `packages/export/src/export.test.ts` at execution time to avoid guessing an API this plan hasn't loaded. All committed-code tasks (1, 2, 5, 6) contain complete edits. Recon-sourced selector values (Task 5) are an explicit data dependency produced by Task 4's findings file, not vague placeholders.

**Type consistency:** `categoryFilter?: (category: CategoryRef) => boolean` is defined in Task 1 and consumed identically in Task 2 (worker builds a matching predicate) and Task 9 (WORKLOG). `RawProduct`/`CategoryRef` shapes match the contracts in `packages/contracts/src/scraper.ts` and `product.ts`. Parse function signatures (`parseCategoryList`, `parseProducts`, `parseNextPageUrl`) are preserved across Tasks 5–6.
