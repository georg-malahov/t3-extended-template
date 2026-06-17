# E2E per-worker isolation runner — port from barwa-ev PR #14

## Overview

Replace this template's dev-server Playwright setup (`test:e2e = playwright test`
against `next dev`, `retries: CI ? 2 : 0`) with a **per-worker-isolated runner**
ported from **barwa-ev PR #14**. `bun run test:e2e` spins up **N isolated stacks**
(default 4): each worker gets its **own Postgres DB** cloned from a once-migrated
template (`CREATE DATABASE app_wK TEMPLATE app_template`) and its **own
`next start` production server** on port `3100+K`, then runs a Playwright shard
against it. The suite runs **fully parallel at `retries=0`** on a prod build —
flakes become real defects to fix, not noise to retry away.

Also ports the **discipline docs** (E2E anti-patterns) into `CLAUDE.md`, the
prod-mode enablers (Better Auth rate-limit gating, hydration-robust submit
helper), and the CI change to a prod-server-per-shard model.

App-specific changes from PR #14 are **NOT** ported (barwa's `admin-*`/`events`/
`news`/`donate`/site-gate/mail specs, its `.spec-durations.json`, the
site-gate/OWNER-bootstrap env). See the boundary table below.

## Context

**Where this template stands today** (the gap vs. barwa's pre-PR state is large —
barwa had already shipped a serial/parallel split in its #12; this template has
none of that):
- Specs: only `tests/e2e/auth.spec.ts` + `tests/e2e/projects.spec.ts`. Both sign
  UP a unique user per test (`signUpAndLogin`) — no seeded OWNER, no shared org.
  This makes specs naturally independent (each test → its own user → its own org
  → its own empty data), so the suite is *more* isolation-friendly than barwa's.
- `playwright.config.ts`: single `chromium` project, `webServer: { command: "bun
  run dev" }`, `retries: process.env.CI ? 2 : 0`.
- `tests/e2e/global-setup.ts`: route-warmup via `fetch` (no `db:seed`).
- `tests/e2e/helpers/auth.ts`: only `signUpAndLogin`.
- `package.json`: `"test:e2e": "playwright test"`.
- `src/lib/auth.ts`: no `rateLimit` block.
- `scripts/container.ts`: already exports `getContainerName`, `isContainerRunning`,
  `sleep` (everything the runner imports). ✅
- `scripts/`: `db:ensure-auth-schema`, `auth:migrate`, `db:migrate`, `db:seed`,
  `up` all exist. ✅ (`db:seed` is a **no-op on a fresh DB** with no users — it
  prints "No users found. Skipping seed." and exits 0; kept for parity.)
- Image bakes `ENV RALPHEX_DOCKER=1` (`.claude/docker/Dockerfile.ralphex:96`), so
  the host wrapper's `docker exec` lands on the in-container orchestrator. ✅
- No site gate, no OWNER bootstrap, no `SITE_GATE_ENABLED` env.

**Proven sources are staged** in `docs/plans/reference/e2e-isolation/` (read its
`README.md` for the file→destination map and the adaptations already applied).
New-file references are pre-adapted and copied **verbatim**; the rest are small
edits described per task. **The final task deletes that reference directory.**

### Scope boundary — port vs. ignore

| Port (infra) | Ignore (app-specific) |
|---|---|
| `scripts/test-e2e.ts` + `scripts/test-e2e.test.ts` | barwa's `admin-*.spec.ts`, `events*.spec.ts`, `news.spec.ts`, `donate.spec.ts`, `site-gate.spec.ts`, etc. |
| `scripts/spec-balance.ts` + `scripts/spec-balance.test.ts` | barwa's `tests/e2e/.spec-durations.json` (its spec list) |
| `playwright.config.ts`, `tests/e2e/global-setup.ts` | barwa's `SITE_GATE_ENABLED` server env + `site-gate.spec` |
| `tests/e2e/helpers/auth.ts` (hydration helper), `db-url.ts`, `db-reset.ts` | `OWNER_BOOTSTRAP_PASSWORD` / seeded-OWNER (`loginAsOwner`) — template signs up fresh users |
| `package.json` scripts, `vitest.config.mts` include | barwa-specific German routes / nav labels / `SiteImage` examples in its CLAUDE.md rules |
| `src/lib/auth.ts` rate-limit gating | mail/GreenMail, profiling — never existed here |
| `.github/workflows/ci.yml` e2e job | — |
| `CLAUDE.md` E2E discipline & anti-patterns | — |

### Decisions (locked with the user)
- **Helper + retrofit raw clicks.** Make `signUpAndLogin` hydration-robust AND
  retrofit the raw sign-in clicks in `auth.spec.ts` so the suite is green at
  retries=0. "Existing specs pass at retries=0" is part of the success bar.
- **Port `db-url.ts` + `db-reset.ts`** (db-reset scoped to this template's models).
- **Stage reference files** (done) → copy-verbatim/adapt per task.

## Development Approach

- **Ralph CANNOT run E2E.** Per-task validation is **lean only**: `bun run lint &&
  bun run typecheck && bun run test:unit`. The real success bar (green suite at
  `retries=0`, workers=1 AND 4, repeated) is **MANUAL operator work** — Task 8.
  Do NOT add per-task dev-mode E2E to any task here; this feature *is* the E2E
  infrastructure.
- New unit coverage rides along for free: `spec-balance.test.ts` +
  `test-e2e.test.ts` (the pure `parseRunnerArgs` / spec-balance functions). The
  `vitest.config.mts` `include` MUST add `scripts/**/*.test.ts` (Task 1) or those
  tests silently don't run.
- **No new dependencies.** The runner uses only Bun built-ins, `psql`, `next`,
  `child_process`. No `bun add`, no image rebuild.
- Tasks are sequential (single-mode): 1→2 (runner imports spec-balance), 3 wires
  `package.json`/config, 4–7 are largely independent, 8 is operator-only.

## Implementation Steps

### Task 1: spec-balance helper + unit tests + vitest include
- [x] Update `vitest.config.mts`: change `include` to
      `["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"]` so the
      new `scripts/*.test.ts` run under `test:unit`.
- [x] Create `scripts/spec-balance.ts` — copy `docs/plans/reference/e2e-isolation/spec-balance.ts.txt` **verbatim** (pure, app-agnostic: `parseSpecDurations`, `binPackByDuration`, `median`, `hasSpecFilter`, `extractShard`, `assignWorkerSpecs`).
- [x] Create `scripts/spec-balance.test.ts` — copy `spec-balance.test.ts.txt` **verbatim**.
- [x] Lean validation. Confirm the new spec-balance tests actually execute (vitest output lists them) and pass.

### Task 2: isolated runner + arg-parser unit tests
- [x] Create `scripts/test-e2e.ts` — copy `docs/plans/reference/e2e-isolation/test-e2e.ts.txt` **verbatim** (already template-adapted: no `SITE_GATE_ENABLED`, imports `getContainerName`/`isContainerRunning`/`sleep` from `./container` and the spec-balance helpers).
- [x] Create `scripts/test-e2e.test.ts` — copy `test-e2e.test.ts.txt` **verbatim** (covers the pure `parseRunnerArgs`; `import.meta.main` is falsy under vitest so importing the runner does NOT trigger orchestration).
- [x] Lean validation. `parseRunnerArgs` tests run green; `typecheck` clean.

### Task 3: Playwright config + global-setup + package.json wiring
- [x] Replace `playwright.config.ts` with `docs/plans/reference/e2e-isolation/playwright.config.ts.txt` (single `chromium` project, `testMatch: "**/*.spec.ts"`, `retries: Number(process.env.E2E_RETRIES ?? 0)`, `webServer` undefined when `PLAYWRIGHT_PROD_SERVER === "1"` else the existing `bun run dev` block).
- [x] Edit `tests/e2e/global-setup.ts`: add as the FIRST statement in `globalSetup`'s body:
      ```ts
      // The isolated runner (scripts/test-e2e.ts) and CI set PLAYWRIGHT_PROD_SERVER=1:
      // each worker's DB is cloned from a seeded template and `next start` needs no
      // route warmup — skip it entirely.
      if (process.env.PLAYWRIGHT_PROD_SERVER === "1") return;
      ```
      (Leave the existing route-warmup loop intact for the dev-server fallback path.)
- [x] Edit `package.json` scripts: `"test:e2e": "bun run scripts/test-e2e.ts"`; add `"test:e2e:dev": "playwright test --workers=1"` and `"test:e2e:pw": "playwright test"`. Keep `test:e2e:ui` and `test:e2e:report` as-is.
- [x] Lean validation.

### Task 4: prod-mode enablers — auth gating + hydration helper + spec retrofit
- [x] Edit `src/lib/auth.ts`: insert directly after the `experimental: { joins: true },` block:
      ```ts
      // Better Auth enables rate limiting by default under NODE_ENV=production. The
      // E2E suite runs against a production build (`next start`) and signs in many
      // times per worker, which trips the limiter ("Too many requests") and flakes
      // login-heavy specs. Disable it ONLY when the E2E flag is set — real prod
      // (no E2E flag) keeps the default protection.
      rateLimit: {
        enabled: process.env.E2E !== "1",
      },
      ```
- [x] Replace `tests/e2e/helpers/auth.ts` with `docs/plans/reference/e2e-isolation/helpers-auth.ts.txt` (adds private `submitUntilLeave`, exported `submitSignIn`, and makes `signUpAndLogin` hydration-robust; keeps the `{ email, name, password }` return shape used by both specs).
- [x] Retrofit `tests/e2e/auth.spec.ts` (surgical):
  - Add `import { submitSignIn } from "./helpers/auth";` (alongside the existing `signUpAndLogin` import).
  - In the **"sign-in with existing credentials reaches dashboard"** test, replace
    `await page.getByRole("button", { name: "Sign in" }).click();` with
    `await submitSignIn(page);` (keep the `toHaveURL(/\/dashboard/)` + workspace assertions).
  - In the **"sign-in with wrong password shows error"** test the page STAYS on
    `/sign-in`, so `submitSignIn` is wrong there. Make the click hydration-robust
    by retrying until the error toast appears:
    ```ts
    await expect(async () => {
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000 });
    ```
    then keep the existing `toContainText(/invalid|incorrect|wrong|error/i)` assertion.
  - Leave the "unauthenticated /dashboard redirect" test unchanged (no click).
- [x] Do NOT pre-emptively rewrite `projects.spec.ts` CRUD clicks — its auth goes
      through the now-robust `signUpAndLogin`. Any residual hydration/data race in
      its CRUD clicks is caught and fixed in Task 8 (operator) with the same
      `toPass` pattern (ralph can't verify E2E behavior).
- [x] Lean validation.

### Task 5: direct-DB test helpers
- [ ] Create `tests/e2e/helpers/db-url.ts` — copy `db-url.ts.txt` **verbatim** (exports `E2E_DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres@localhost/app"`).
- [ ] Create `tests/e2e/helpers/db-reset.ts` — copy `db-reset.ts.txt`. TRUNCATE lists are scoped to this template: public `"Project"`,`"Membership"`,`"Organization"`,`"User"` and auth `auth."session"`,`auth."account"`,`auth."verification"`,`auth."user"`. **Confirm the auth table names** against `bun run auth:generate` output / the live `auth` schema; adjust if they differ.
- [ ] These helpers are infra for future specs that hit Postgres directly; no
      current spec imports them. If `lint` flags `db-reset.ts` as an unused module
      (default configs do NOT), prefer leaving it — do not delete it.
- [ ] Lean validation (`typecheck` must see both files clean).

### Task 6: CI — prod-server-per-shard
- [ ] In `.github/workflows/ci.yml`, the `e2e` job:
  - In "Run codegen and migrations", add `docker exec $CONTAINER bun run db:ensure-auth-schema` **before** the `auth:migrate` line.
  - Replace the **"Start dev server"** step with two steps:
    ```yaml
    - name: Build production bundle
      run: docker exec $CONTAINER bunx next build

    - name: Start prod server
      run: docker exec -d -e E2E=1 $CONTAINER bunx next start -p 3000 --hostname 0.0.0.0
    ```
    (NO `SITE_GATE_ENABLED`, NO `OWNER_BOOTSTRAP_PASSWORD` — this template has neither.)
  - Keep the "Wait for app to be ready" curl-poll step unchanged.
  - In the "E2E tests (shard …)" step, add `-e PLAYWRIGHT_PROD_SERVER=1`:
    ```yaml
    run: docker exec -e CI=true -e PLAYWRIGHT_PROD_SERVER=1 $CONTAINER bun run test:e2e -- --shard=${{ matrix.shard }}/4
    ```
    (Each shard container runs ONE prod server via `runCiPassthrough`; with no
    committed `.spec-durations.json` it falls back to native `--shard`.)
  - Leave the blob-report upload + `report` merge job unchanged.
- [ ] Lean validation (YAML well-formed; `bun run lint`/`typecheck`/`test:unit` still green).

### Task 7: documentation — CLAUDE.md discipline & anti-patterns
- [ ] In `CLAUDE.md` "## Commands" → "Direct commands" table: change the `test:e2e`
      row to "E2E (prod) — N isolated workers (own DB + `next start` each)"; add
      rows for `test:e2e:dev` ("E2E (dev) — `playwright test --workers=1` vs `next
      dev`, no build") and `test:e2e:pw` ("Raw Playwright passthrough; expert
      escape hatch").
- [ ] In "## Testing" → "### E2E Tests (Playwright)": replace the "(Playwright
      auto-starts dev server)" wording and add:
  - A short **per-worker isolation runner** paragraph (N isolated workers, own DB
    clone + `next start` each, `retries=0` on a prod build; flags `--workers=N`,
    `--skip-build`, `--record-durations`, `--no-balance`; env knobs `E2E_WORKERS`/
    `E2E_BASE_PORT`/`E2E_RETRIES`).
  - A **two run modes** note: Prod (`bun run test:e2e`, canonical) vs Dev
    (`bun run test:e2e:dev [spec]`, no build, serial).
- [ ] Add a new subsection **"### E2E discipline & anti-patterns (retries=0 — flakes are bugs)"** with these 8 rules (template-adapted; drop barwa's German/`SiteImage` examples):
  1. **No fixed-time waits.** Never `page.waitForTimeout`, `networkidle`, or `waitForLoadState`. Use auto-waiting assertions (`toBeVisible`, `toHaveURL`). A synchronous read (`page.url()`) gets an auto-waiting assertion in front of it, never a sleep.
  2. **Specific locators.** A bare `getByText(...)` / `input[type=file]` breaks strict-mode the moment a second match appears. Scope to a role/testid/parent.
  3. **Prefer unique per-test data; clean up shared state you mutate.** Specs on the same worker share that worker's DB serially. Each test should create its own user/org (as `signUpAndLogin` does). If a spec mutates a shared/singleton row, restore it in `afterAll`.
  4. **Hydration-safe interactions.** Under a prod `next start` build a click can land before React hydration (a lost no-op). Wrap click→effect in a `toPass` retry. See `submitSignIn` in `tests/e2e/helpers/auth.ts`.
  5. **Direct DB access uses the worker DB.** Specs hitting Postgres must read `process.env.DATABASE_URL` via `tests/e2e/helpers/db-url.ts` (`E2E_DATABASE_URL`), never a hardcoded `…/app` — each worker's server writes to `app_wK`.
  6. **Prod-vs-dev divergences are real.** Things off in `next dev` are ON under `next start` (`NODE_ENV=production`): Better Auth **rate limiting** (gated off in `auth.ts` only when `E2E=1`, which the runner/CI set). A login-heavy flake only in prod → suspect rate limiting first.
  7. **Match current app behavior, not stale assumptions.** E2E drifts when not run; verify routes/labels/default views against the source before asserting.
  8. **No long per-assertion timeouts to mask races.** A `{ timeout: 30000 }` makes a real failure take 30s. Fix the underlying race and keep timeouts tight so failures are quick.
- [ ] In "## Environment variables reference": add `E2E` (runtime flag — disables Better Auth rate limiting; set by runner/CI), `E2E_WORKERS`, `E2E_BASE_PORT`, `E2E_RETRIES`, `E2E_SKIP_BUILD`, `E2E_RECORD_DURATIONS`, `E2E_NO_BALANCE`. Mark all "no" (runtime-only, not in `env.ts`).
- [ ] Lean validation.

### Task 8: MANUAL validation (operator — NOT ralph) + cleanup
> Ralph stops after Task 7. The steps below require a live container and real E2E
> runs (ralph's validation is lint+typecheck+test:unit only).
- [ ] `bun run test:e2e --workers=1` — builds once, one worker, **retries=0**, green.
- [ ] `bun run test:e2e` — default 4 workers, all shards green, retries=0.
- [ ] Re-run `bun run test:e2e` once more to confirm stability (no intermittent failures).
- [ ] Fix any hydration/data race surfaced in `projects.spec.ts` (or elsewhere)
      using the documented `toPass` pattern — do not raise timeouts or add retries.
- [ ] (Optional) `bun run test:e2e --record-durations` to seed
      `tests/e2e/.spec-durations.json`. With only 2 specs < 4 workers, balancing is
      skipped (runner falls back to `--shard`), so the file is informational until
      the suite grows beyond the worker count — commit it only if you want it.
- [ ] Delete the scaffolding: `rm -rf docs/plans/reference/e2e-isolation` and
      remove `docs/plans/reference/` if now empty.
- [ ] Add a project-memory entry capturing the E2E discipline + runner design
      (host-side — the ralphex container can't write `~/.claude` memory). The
      `CLAUDE.md` discipline section (Task 7) is the in-repo canonical doc; this
      memory is the cross-session pointer to it.

## Validation gates
- **Unit/type/lint (ralph, per task):** `parseRunnerArgs` + all spec-balance
  functions unit-tested and green under `test:unit`; `typecheck` + `lint` clean.
- **Integration (operator, Task 8):** green suite at workers=1 AND workers=4,
  retries=0, twice. No `zenstack/~schema.prisma` migrate race; no `test-results`
  artifact collisions across shards.
- **CI:** the PR for this work exercises the new prod-server-per-shard path across
  4 matrix shards — a real end-to-end signal beyond the local operator run.

## Notes for the executor
- Copy the new-file references **verbatim** — they are pre-adapted. Do not
  reinvent the runner.
- `db:seed` against a fresh template DB is a **no-op** (no users) and exits 0 —
  expected, not an error.
- Keep timeouts tight and `retries=0`; if a spec flakes, fix the race (hydration
  `toPass`, precise wait), never paper over it.
- The reference dir under `docs/plans/reference/e2e-isolation/` is scaffolding —
  Task 8 deletes it.
