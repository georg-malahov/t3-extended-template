# Reference sources — E2E per-worker isolation runner

Proven sources for the E2E isolation port, ported from **barwa-ev PR #14**
(`feat/e2e-per-worker-isolation`), which itself adapted theomedis-physio #55/#56.
These have been **pre-adapted to this template** so the new-file ones can be
copied **verbatim**. Read them, copy/adapt per the plan — do not reinvent.

This directory is **scaffolding**: the plan's final task deletes it.

## Files

| Reference file | Destination | How |
|---|---|---|
| `spec-balance.ts.txt` | `scripts/spec-balance.ts` | copy verbatim (pure, app-agnostic) |
| `spec-balance.test.ts.txt` | `scripts/spec-balance.test.ts` | copy verbatim |
| `test-e2e.ts.txt` | `scripts/test-e2e.ts` | copy verbatim (already template-adapted) |
| `test-e2e.test.ts.txt` | `scripts/test-e2e.test.ts` | copy verbatim |
| `playwright.config.ts.txt` | `playwright.config.ts` | replace existing (template-adapted) |
| `helpers-auth.ts.txt` | `tests/e2e/helpers/auth.ts` | replace existing (adds `submitSignIn`, hydration-robust signup) |
| `db-url.ts.txt` | `tests/e2e/helpers/db-url.ts` | new file, verbatim |
| `db-reset.ts.txt` | `tests/e2e/helpers/db-reset.ts` | new file (confirm auth table names) |

## Adaptations already applied (vs. barwa's source)

These template-specific changes are **baked into the `.txt` files** — you do NOT
need to redo them. Listed so you understand the diff from barwa:

1. **No site gate.** Barwa's `startServers` set `SITE_GATE_ENABLED: "true"`; this
   template has no site gate, so that env var is removed from `test-e2e.ts.txt`.
   The CI port (plan Task 6) likewise omits `SITE_GATE_ENABLED` and the
   `OWNER_BOOTSTRAP_PASSWORD` secret (this template has no OWNER bootstrap).
2. **Single `chromium` project.** This template already had one project, so no
   serial/UI split to collapse — `playwright.config.ts.txt` keeps the single
   project and just adds `testMatch`, the `E2E_RETRIES` retries, and the
   `PLAYWRIGHT_PROD_SERVER` webServer toggle.
3. **`signUpAndLogin` (not `loginAsOwner`).** This template's specs sign UP a
   unique user per test (no seeded OWNER). `helpers-auth.ts.txt` keeps that flow
   and wraps the submit in the hydration-robust retry; it also exports
   `submitSignIn` for specs that sign in directly.
4. **`RALPHEX_DOCKER` not passed explicitly.** The image bakes in
   `ENV RALPHEX_DOCKER=1` (`.claude/docker/Dockerfile.ralphex:96`), so the host
   wrapper's `docker exec` already lands on `runInside()` — matches barwa.
5. **`db-reset.ts`** TRUNCATE lists are scoped to this template's models
   (`User`/`Organization`/`Membership`/`Project`) and Better Auth's default auth
   tables. Confirm auth table names against `bun run auth:generate` if unsure.

## Things the runner depends on (all already present in this template)

- `scripts/container.ts` exports `getContainerName`, `isContainerRunning`, `sleep`.
- `package.json` scripts: `db:ensure-auth-schema`, `auth:migrate`, `db:migrate`,
  `db:seed`, `up`.
- The dev/ralphex image runs Postgres reachable at `postgresql://postgres@localhost`.
- `bunx next build` + `bunx next start` work (standard Next build).
