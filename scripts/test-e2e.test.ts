/**
 * Unit tests for the pure helpers in test-e2e.ts (the single isolated E2E runner).
 *
 * These tests cover the PURE functions (no Docker, no network, no process.env mutations):
 *   - parseRunnerArgs (the --workers / --skip-build / --record-durations / --no-balance CLI parser)
 *
 * The side-effecting functions (runHostWrapper, runInside, runCiPassthrough,
 * startServers, stopServers, etc.) are integration-level and are covered by an
 * actual E2E run.
 *
 * Note: `import.meta.main` is falsy in Vitest/Vite so importing test-e2e.ts does
 * NOT trigger the orchestrator — the top-level `if (import.meta.main)` block is
 * skipped entirely.
 */

import { describe, expect, it } from "vitest";

import { parseRunnerArgs } from "./test-e2e";

// ── parseRunnerArgs ───────────────────────────────────────────────────────────

describe("parseRunnerArgs", () => {
  it("returns defaults for an empty argv", () => {
    expect(parseRunnerArgs([])).toEqual({
      workers: undefined,
      skipBuild: false,
      recordDurations: false,
      noBalance: false,
      passthrough: [],
    });
  });

  it("parses --workers=N (equals form)", () => {
    const parsed = parseRunnerArgs(["--workers=7"]);
    expect(parsed.workers).toBe(7);
    expect(parsed.passthrough).toEqual([]);
  });

  it("parses --workers N (space form) and consumes the value token", () => {
    const parsed = parseRunnerArgs(["--workers", "3"]);
    expect(parsed.workers).toBe(3);
    expect(parsed.passthrough).toEqual([]);
  });

  it("floors a fractional worker count", () => {
    expect(parseRunnerArgs(["--workers=2.9"]).workers).toBe(2);
  });

  it("drops --workers with a missing or non-numeric value (never forwards it)", () => {
    // Non-numeric value: the value token is NOT consumed (it's a real arg),
    // but the bare --workers flag is dropped so it can't reach Playwright.
    const nonNumeric = parseRunnerArgs(["--workers", "tests/e2e/auth.spec.ts"]);
    expect(nonNumeric.workers).toBeUndefined();
    expect(nonNumeric.passthrough).toEqual(["tests/e2e/auth.spec.ts"]);

    // Trailing --workers with no value at all: dropped, nothing forwarded.
    const trailing = parseRunnerArgs(["--workers"]);
    expect(trailing.workers).toBeUndefined();
    expect(trailing.passthrough).toEqual([]);
  });

  it("ignores --workers=0 and negative counts (invalid → undefined)", () => {
    expect(parseRunnerArgs(["--workers=0"]).workers).toBeUndefined();
    expect(parseRunnerArgs(["--workers=-2"]).workers).toBeUndefined();
  });

  it("parses --skip-build flag", () => {
    const parsed = parseRunnerArgs(["--skip-build"]);
    expect(parsed.skipBuild).toBe(true);
    expect(parsed.passthrough).toEqual([]);
  });

  it("parses --record-durations and --no-balance (not forwarded to Playwright)", () => {
    expect(parseRunnerArgs([]).recordDurations).toBe(false);
    expect(parseRunnerArgs([]).noBalance).toBe(false);
    const parsed = parseRunnerArgs(["--record-durations", "--no-balance"]);
    expect(parsed.recordDurations).toBe(true);
    expect(parsed.noBalance).toBe(true);
    expect(parsed.passthrough).toEqual([]);
  });

  it("forwards everything else as Playwright passthrough, preserving order", () => {
    const parsed = parseRunnerArgs([
      "tests/e2e/auth.spec.ts",
      "--workers=2",
      "--grep",
      "@smoke",
      "--skip-build",
    ]);
    expect(parsed.workers).toBe(2);
    expect(parsed.skipBuild).toBe(true);
    // --grep and its value are NOT runner flags, so they pass straight through.
    expect(parsed.passthrough).toEqual([
      "tests/e2e/auth.spec.ts",
      "--grep",
      "@smoke",
    ]);
  });

  it("leaves a CI --shard arg untouched in passthrough", () => {
    const parsed = parseRunnerArgs(["--shard=2/5"]);
    expect(parsed.workers).toBeUndefined();
    expect(parsed.passthrough).toEqual(["--shard=2/5"]);
  });

  it("last --workers wins when repeated", () => {
    expect(parseRunnerArgs(["--workers=2", "--workers=9"]).workers).toBe(9);
  });

  it("--workers=abc (equals form, non-numeric) → workers undefined, not forwarded", () => {
    const parsed = parseRunnerArgs(["--workers=abc"]);
    expect(parsed.workers).toBeUndefined();
    expect(parsed.passthrough).toEqual([]);
  });

  it("--workers=Infinity → workers undefined (not a finite integer)", () => {
    const parsed = parseRunnerArgs(["--workers=Infinity"]);
    expect(parsed.workers).toBeUndefined();
    expect(parsed.passthrough).toEqual([]);
  });

  it("bad --workers after a good one keeps the prior value", () => {
    // ["--workers=3","--workers=abc"]: first parse sets workers=3, second is
    // bad (equals-form non-numeric) so workers stays 3.
    const parsed = parseRunnerArgs(["--workers=3", "--workers=abc"]);
    expect(parsed.workers).toBe(3);
    expect(parsed.passthrough).toEqual([]);
  });

  it("spec path passthrough is collected verbatim", () => {
    const parsed = parseRunnerArgs(["tests/e2e/projects.spec.ts", "tests/e2e/auth.spec.ts"]);
    expect(parsed.passthrough).toEqual([
      "tests/e2e/projects.spec.ts",
      "tests/e2e/auth.spec.ts",
    ]);
    expect(parsed.workers).toBeUndefined();
    expect(parsed.skipBuild).toBe(false);
  });

  it("--workers with a spec path: value not consumed, spec goes to passthrough", () => {
    // `--workers tests/e2e/x.spec.ts` — the spec path is NOT numeric, so
    // --workers is dropped and the spec becomes passthrough.
    const parsed = parseRunnerArgs(["--workers", "tests/e2e/x.spec.ts"]);
    expect(parsed.workers).toBeUndefined();
    expect(parsed.passthrough).toEqual(["tests/e2e/x.spec.ts"]);
  });

  it("bad space-form --workers after a good equals-form one keeps prior value, bad token goes to passthrough", () => {
    const parsed = parseRunnerArgs(["--workers=3", "--workers", "abc"]);
    expect(parsed.workers).toBe(3);
    expect(parsed.passthrough).toEqual(["abc"]);
  });
});
