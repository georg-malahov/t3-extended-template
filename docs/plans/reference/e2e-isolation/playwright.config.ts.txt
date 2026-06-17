import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// TRACE_ALL=1 bun run test:e2e  →  capture traces for all tests (not just failures)
const traceAll = !!process.env.TRACE_ALL;

export default defineConfig({
  testDir: "./tests/e2e",
  // E2E specs are `*.spec.ts`. Restrict the match so Playwright never tries to
  // run co-located Vitest `*.test.ts` helper tests, which import "vitest" and
  // crash Playwright's collection. Playwright's default testMatch is
  // **/*.@(spec|test).ts, which would pick them up.
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  // Default 0 retries — per-worker isolation makes retries unnecessary; a flake
  // is a real defect to fix, not to retry away. Set E2E_RETRIES=N as an escape
  // hatch (e.g. on slow CI machines).
  retries: Number(process.env.E2E_RETRIES ?? 0),
  timeout: 60_000,
  outputDir: "test-results",
  reporter: process.env.CI
    ? [["blob"], ["list"]]
    : [
        ["list"],
        ["html", { open: "never" }],
        ["json", { outputFile: "playwright-report/results.json" }],
      ],
  use: {
    baseURL,
    trace: traceAll ? "on" : "retain-on-failure",
  },
  projects: [
    {
      // Single project: under the isolation runner each shard runs --workers=1 on
      // its own server + DB clone, so there is no shared state to race on.
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Two supported run modes:
  //  - PROD (canonical, full suite): `bun run test:e2e` → the isolated runner
  //    (scripts/test-e2e.ts) and CI both pre-start a `next start` server and set
  //    PLAYWRIGHT_PROD_SERVER=1, so webServer is undefined (the runner owns it).
  //  - DEV (fast iteration, no build): `bun run test:e2e:dev [spec]` (and
  //    `test:e2e:ui` / raw `test:e2e:pw`) leave the flag unset, so this webServer
  //    auto-starts `next dev` on baseURL and reuses a running one. Run dev mode
  //    with --workers=1 (the test:e2e:dev script) — a single dev server shares
  //    one DB, so parallel specs would race; serial keeps it reliable at retries=0.
  webServer:
    process.env.PLAYWRIGHT_PROD_SERVER === "1"
      ? undefined
      : {
          command: "bun run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: "ignore",
          stderr: "ignore",
        },
});
