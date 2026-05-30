# AGENTS.md — workflow & logging conventions for the QuateCalc agent army

This repo is built by a "team of agents" working in parallel waves. This file is
the **single source of truth** for how agents coordinate, log, commit, and verify
their work. Read it before starting any task.

## 1. The wave / contract-first workflow

- **Contracts are frozen first.** All cross-package types live in
  `packages/contracts` (Zod schemas + TS types). Agents code against these; the
  schema files and `packages/db/prisma/schema.prisma` are changed only in a
  coordinated "foundation" step, never ad-hoc mid-wave.
- **One agent owns one folder.** Each `packages/*` or `apps/*` directory has a
  single owning agent per wave. Do **not** edit another package's source. Cross
  boundaries only through `@quatecalc/contracts`, `@quatecalc/db`, `@quatecalc/units`.
- **Waves:** `0` foundation → `1` parallel core packages → `2` integration
  (apps) → `3` hardening. New suppliers/features are additive (a new adapter
  folder), not edits to shared code.

## 2. Verification gates (MUST pass before you commit)

Run, scoped to your package:

```bash
pnpm --filter @quatecalc/<pkg> typecheck   # tsc --noEmit, zero errors
pnpm --filter @quatecalc/<pkg> test        # vitest, all green
```

- Pure/logic packages must be tested **offline** (no DB, no network) using fakes
  and fixtures. Integration tests that need Postgres must be read-only and must
  not disturb seeded data used by other suites.
- Never run `pnpm install` / `pnpm add` from a parallel agent (it races the
  shared lockfile). If a dependency is missing, STOP and report it.

## 3. Git & commit convention

- Work on the designated feature branch; never push elsewhere without permission.
- **One commit per completed workstream.** Subject line:
  `Wave N: <area> — <short summary>` (e.g. `Wave 1: matching engine`).
  Additive features may use `Add <thing>` (e.g. `Add Tambour supplier adapter`).
- Commit body: bullet points of what changed, the public API added, test counts,
  and one line of how it was verified.
- After committing, **append a WORKLOG entry** (§4) and push.

## 4. WORKLOG logging convention  ← the team log

Every completed unit of work appends ONE entry to [`docs/WORKLOG.md`](docs/WORKLOG.md),
newest at the bottom of its wave section, using this template:

```md
### [YYYY-MM-DD] Wave <N> — <workstream>  (agent: <model/type>)
- **Task:** one sentence.
- **Paths:** the folder(s) owned/created.
- **Public API:** key exported functions/types other packages rely on.
- **Tests:** <count> passing — <what they cover>.
- **Verified:** how (unit/integration/e2e/runtime against Postgres).
- **Commit:** <short-hash>.
- **Status:** ✅ done | 🔄 in-progress | ⚠️ blocked (reason).
```

Rules:
- The WORKLOG is **append-only**; never rewrite history, only add/checkmark.
- Log blockers and decisions too (e.g. "live scrape blocked by 403 anti-bot").
- Keep entries scannable — link to the commit for detail.

## 5. Runtime logging convention (in code)

- Scrapers/jobs log through the injected `ctx.log(level, msg, meta?)` with levels
  `debug | info | warn | error` (see `@quatecalc/contracts` `ScraperContext`).
  Do not use bare `console.*` inside library packages; apps may format/sink logs.
- Log one structured line per meaningful step (e.g. `discovered N categories`,
  run health summary). Never log secrets or full page bodies.

## 6. Package map (ownership boundaries)

| Path | Responsibility |
|------|----------------|
| `packages/contracts` | shared Zod schemas + types (the frozen contract) |
| `packages/db` | Prisma schema, client, repositories, seed |
| `packages/units` | Hebrew text normalization, unit parse/convert |
| `packages/matching` | free-text → catalog SKU matching |
| `packages/pricing` | totals / overhead / margin / VAT (pure) |
| `packages/export` | Excel + CSV export |
| `packages/scraper-core` | registry, rate-limit, robots, cache, runner |
| `packages/scraper-adapters` | one folder per supplier (`ace/`, `tambour/`, …) |
| `apps/web` | Next.js RTL Hebrew UI + API routes |
| `apps/worker` | catalog refresh job (fixtures/live) |
