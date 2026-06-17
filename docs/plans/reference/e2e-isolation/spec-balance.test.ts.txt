/**
 * Unit tests for the pure helpers in spec-balance.ts.
 *
 * All functions are pure (no IO, no network, no Docker) — fully unit-testable.
 */

import { describe, expect, it } from "vitest";

import {
  assignWorkerSpecs,
  binPackByDuration,
  extractShard,
  hasSpecFilter,
  median,
  parseSpecDurations,
} from "./spec-balance";

// ── parseSpecDurations ────────────────────────────────────────────────────────

describe("parseSpecDurations", () => {
  it("returns empty record for empty input", () => {
    expect(parseSpecDurations("")).toEqual({});
  });

  it("parses duration in seconds", () => {
    const log = "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › login (1.3s)";
    const result = parseSpecDurations(log);
    expect(result["tests/e2e/auth.spec.ts"]).toBeCloseTo(1300, 0);
  });

  it("parses duration in milliseconds", () => {
    const log = "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › login (450ms)";
    const result = parseSpecDurations(log);
    expect(result["tests/e2e/auth.spec.ts"]).toBeCloseTo(450, 0);
  });

  it("parses duration in minutes", () => {
    const log = "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › login (2m)";
    const result = parseSpecDurations(log);
    expect(result["tests/e2e/auth.spec.ts"]).toBeCloseTo(120000, 0);
  });

  it("sums durations for multiple tests in the same spec file", () => {
    const log = [
      "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › test a (1.0s)",
      "  ✓  2 [chromium] › tests/e2e/auth.spec.ts:10:7 › test b (2.0s)",
    ].join("\n");
    const result = parseSpecDurations(log);
    expect(result["tests/e2e/auth.spec.ts"]).toBeCloseTo(3000, 0);
  });

  it("handles multiple spec files independently", () => {
    const log = [
      "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › test a (1.0s)",
      "  ✓  2 [chromium] › tests/e2e/projects.spec.ts:5:7 › test b (2.0s)",
    ].join("\n");
    const result = parseSpecDurations(log);
    expect(result["tests/e2e/auth.spec.ts"]).toBeCloseTo(1000, 0);
    expect(result["tests/e2e/projects.spec.ts"]).toBeCloseTo(2000, 0);
  });

  it("ignores lines that do not match", () => {
    const log = "some random line without a spec path";
    expect(parseSpecDurations(log)).toEqual({});
  });

  it("ignores durations with unsupported units (e.g. 3h)", () => {
    // The regex only captures ms/s/m — a line with 'h' does not match and is silently ignored.
    const log = "  ✓  1 [chromium] › tests/e2e/auth.spec.ts:5:7 › login (3h)";
    expect(parseSpecDurations(log)).toEqual({});
  });
});

// ── median ────────────────────────────────────────────────────────────────────

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns 0 for array of zeros (filters them out)", () => {
    expect(median([0, 0, 0])).toBe(0);
  });

  it("returns the single value for a one-element array", () => {
    expect(median([5])).toBe(5);
  });

  it("returns average of two middle values for even-length array", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("returns middle value for odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3);
  });

  it("ignores zero values when computing median", () => {
    expect(median([0, 0, 4, 6])).toBe(5);
  });
});

// ── binPackByDuration ─────────────────────────────────────────────────────────

describe("binPackByDuration", () => {
  it("returns N empty arrays for no items", () => {
    const result = binPackByDuration([], 3);
    expect(result).toHaveLength(3);
    result.forEach((bin) => expect(bin).toHaveLength(0));
  });

  it("all items go to one bin when N=1", () => {
    const items = [
      { spec: "a.spec.ts", ms: 100 },
      { spec: "b.spec.ts", ms: 200 },
    ];
    const result = binPackByDuration(items, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("a.spec.ts");
    expect(result[0]).toContain("b.spec.ts");
  });

  it("balances items into N bins (each item appears exactly once)", () => {
    const items = [
      { spec: "a.spec.ts", ms: 100 },
      { spec: "b.spec.ts", ms: 200 },
      { spec: "c.spec.ts", ms: 300 },
      { spec: "d.spec.ts", ms: 400 },
    ];
    const result = binPackByDuration(items, 2);
    expect(result).toHaveLength(2);
    const allSpecs = result.flat();
    expect(allSpecs).toHaveLength(4);
    expect(new Set(allSpecs).size).toBe(4);
  });

  it("returns N arrays (may have empty bins when fewer items than N)", () => {
    const items = [{ spec: "a.spec.ts", ms: 100 }];
    const result = binPackByDuration(items, 3);
    expect(result).toHaveLength(3);
    const allSpecs = result.flat();
    expect(allSpecs).toHaveLength(1);
  });

  it("LPT balance: 400/300/200/100 across 2 bins — loads within ±1ms of each other", () => {
    // LPT assigns 400→bin0, 300→bin1, 200→bin1, 100→bin0. Loads: 500 vs 500.
    const items = [
      { spec: "a.spec.ts", ms: 400 },
      { spec: "b.spec.ts", ms: 300 },
      { spec: "c.spec.ts", ms: 200 },
      { spec: "d.spec.ts", ms: 100 },
    ];
    const result = binPackByDuration(items, 2);
    const loads = result.map((bin) =>
      bin.reduce((sum, spec) => {
        const item = items.find((i) => i.spec === spec)!;
        return sum + item.ms;
      }, 0),
    );
    expect(Math.abs(loads[0] - loads[1])).toBeLessThanOrEqual(1);
  });
});

// ── hasSpecFilter ─────────────────────────────────────────────────────────────

describe("hasSpecFilter", () => {
  it("returns false for empty args", () => {
    expect(hasSpecFilter([])).toBe(false);
  });

  it("returns true when a .spec.ts path is present", () => {
    expect(hasSpecFilter(["tests/e2e/auth.spec.ts"])).toBe(true);
  });

  it("returns true for --grep flag", () => {
    expect(hasSpecFilter(["--grep", "@smoke"])).toBe(true);
    expect(hasSpecFilter(["-g", "@smoke"])).toBe(true);
    expect(hasSpecFilter(["--grep=@smoke"])).toBe(true);
  });

  it("returns false for other Playwright flags", () => {
    expect(hasSpecFilter(["--workers=4", "--shard=1/4"])).toBe(false);
  });
});

// ── extractShard ──────────────────────────────────────────────────────────────

describe("extractShard", () => {
  it("returns null for empty args", () => {
    expect(extractShard([])).toBeNull();
  });

  it("parses --shard=K/N (equals form)", () => {
    const result = extractShard(["--shard=2/4"]);
    expect(result).toEqual({ k: 2, n: 4, rest: [] });
  });

  it("parses --shard K/N (space form)", () => {
    const result = extractShard(["--shard", "3/5"]);
    expect(result).toEqual({ k: 3, n: 5, rest: [] });
  });

  it("strips the shard arg and preserves other args in rest", () => {
    const result = extractShard(["--workers=1", "--shard=1/4", "--retries=0"]);
    expect(result?.k).toBe(1);
    expect(result?.n).toBe(4);
    expect(result?.rest).toEqual(["--workers=1", "--retries=0"]);
  });

  it("returns null for k=0 or k>n", () => {
    expect(extractShard(["--shard=0/4"])).toBeNull();
    expect(extractShard(["--shard=5/4"])).toBeNull();
  });

  it("returns null for n=0", () => {
    expect(extractShard(["--shard=1/0"])).toBeNull();
  });

  it("returns null when --shard is absent", () => {
    expect(extractShard(["--workers=4"])).toBeNull();
  });

  it("returns null for --shard with a malformed value (not K/N)", () => {
    expect(extractShard(["--shard", "abc"])).toBeNull();
    expect(extractShard(["--shard=abc"])).toBeNull();
  });

  it("returns null for trailing --shard with no value token", () => {
    expect(extractShard(["--retries=0", "--shard"])).toBeNull();
  });
});

// ── assignWorkerSpecs ─────────────────────────────────────────────────────────

describe("assignWorkerSpecs", () => {
  const durations: Record<string, number> = {
    "tests/e2e/auth.spec.ts": 5000,
    "tests/e2e/projects.spec.ts": 3000,
    "tests/e2e/events.spec.ts": 2000,
    "tests/e2e/documents.spec.ts": 1000,
  };

  it("returns null when n < 1", () => {
    expect(assignWorkerSpecs(["a.spec.ts"], durations, 0)).toBeNull();
  });

  it("returns null when fewer specs than workers", () => {
    expect(
      assignWorkerSpecs(["tests/e2e/auth.spec.ts"], durations, 4),
    ).toBeNull();
  });

  it("assigns all specs exactly once across N bins", () => {
    const specs = Object.keys(durations);
    const result = assignWorkerSpecs(specs, durations, 2);
    expect(result).not.toBeNull();
    const allSpecs = result!.flat();
    expect(allSpecs).toHaveLength(specs.length);
    expect(new Set(allSpecs).size).toBe(specs.length);
  });

  it("returns N bins", () => {
    const specs = Object.keys(durations);
    const result = assignWorkerSpecs(specs, durations, 2);
    expect(result).toHaveLength(2);
  });

  it("uses median for unknown specs", () => {
    const specs = [
      "tests/e2e/auth.spec.ts",
      "tests/e2e/unknown-new.spec.ts", // not in durations
    ];
    const result = assignWorkerSpecs(specs, durations, 2);
    expect(result).not.toBeNull();
    const allSpecs = result!.flat();
    expect(allSpecs).toContain("tests/e2e/unknown-new.spec.ts");
  });

  it("distributes specs with empty durations map (||1000 fallback) into N bins of length 1", () => {
    const specs = ["tests/e2e/a.spec.ts", "tests/e2e/b.spec.ts"];
    // All specs unknown → fallback ms=1000 each → LPT places one per bin.
    const result = assignWorkerSpecs(specs, {}, 2);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    expect(result![0]).toHaveLength(1);
    expect(result![1]).toHaveLength(1);
  });
});
