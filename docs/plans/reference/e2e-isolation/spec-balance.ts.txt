#!/usr/bin/env bun
/**
 * spec-balance — duration-aware distribution of E2E specs across worker shards.
 *
 * Playwright's `--shard=k/N` splits by test COUNT, which is duration-blind: with
 * specs ranging from sub-second to ~16s, count-based shards finish unevenly and
 * the suite waits on the slowest one (measured: 96s vs 66s across 4 shards). Our
 * isolated runner assigns specs to workers itself, so instead of `--shard` we can
 * bin-pack specs into N groups of roughly equal total duration (greedy LPT), which
 * a simulation showed collapses the 30s spread to <1s (slowest shard 96s → ~76s).
 *
 * Durations come from a committed map (`tests/e2e/.spec-durations.json`), refreshed
 * by `bun run test:e2e --record-durations` (which parses the per-shard run logs).
 * Unknown/new specs get the median duration so they're still spread; if the map is
 * missing the runner falls back to `--shard`.
 *
 * All functions here are PURE (no IO) and unit-tested in `spec-balance.test.ts`.
 */

/**
 * Parse Playwright list-reporter stdout into per-spec total duration (ms).
 *
 * Lines look like:
 *   `  ✓  12 [chromium] › tests/e2e/projects.spec.ts:5:7 › … (1.3s)`
 * Durations are summed per spec file across all tests (and across shards when the
 * caller concatenates multiple shard logs).
 */
export function parseSpecDurations(logText: string): Record<string, number> {
  const re = /(tests\/e2e\/[A-Za-z0-9._-]+\.spec\.ts):.*\(([0-9.]+)(ms|s|m)\)\s*$/;
  const out: Record<string, number> = {};
  for (const line of logText.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const spec = m[1];
    const v = parseFloat(m[2]);
    const ms = m[3] === "ms" ? v : m[3] === "s" ? v * 1000 : v * 60000;
    out[spec] = (out[spec] ?? 0) + ms;
  }
  return out;
}

/**
 * Greedy longest-processing-time bin-packing: sort items by ms descending, then
 * place each into the currently-lightest bin. Near-optimal for makespan and
 * robust to moderate duration noise. Returns N arrays of spec paths (bins kept in
 * their original 0..N-1 order, not sorted by load).
 */
export function binPackByDuration(
  items: { spec: string; ms: number }[],
  n: number,
): string[][] {
  const bins = Array.from({ length: n }, () => ({ load: 0, specs: [] as string[] }));
  for (const it of [...items].sort((a, b) => b.ms - a.ms)) {
    let lightest = 0;
    for (let i = 1; i < n; i++) if (bins[i].load < bins[lightest].load) lightest = i;
    bins[lightest].load += it.ms;
    bins[lightest].specs.push(it.spec);
  }
  return bins.map((b) => b.specs);
}

/** Median of a numeric list (0 for empty). Used as the fallback for unknown specs. */
export function median(values: number[]): number {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** True if args carry an explicit spec path or `--grep` (→ don't balance; let
 *  Playwright resolve which tests match). Shared by the local + CI balancing paths. */
export function hasSpecFilter(args: string[]): boolean {
  return args.some(
    (a) => a.endsWith(".spec.ts") || a === "--grep" || a === "-g" || a.startsWith("--grep"),
  );
}

/**
 * Extract `--shard=K/N` (or `--shard K/N`) from args, returning the parsed shard
 * plus the remaining args with the shard flag stripped. Returns null when absent or
 * malformed (`k<1`, `n<1`, `k>n`). Used by the CI path to turn a count-based shard
 * request into a duration-balanced bin. Pure — unit-tested.
 */
export function extractShard(
  args: string[],
): { k: number; n: number; rest: string[] } | null {
  const rest: string[] = [];
  let shard: { k: number; n: number } | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = /^--shard=(\d+)\/(\d+)$/.exec(a);
    if (eq) {
      shard = { k: Number(eq[1]), n: Number(eq[2]) };
      continue;
    }
    if (a === "--shard") {
      const m = /^(\d+)\/(\d+)$/.exec(args[i + 1] ?? "");
      if (m) {
        shard = { k: Number(m[1]), n: Number(m[2]) };
        i++;
        continue;
      }
    }
    rest.push(a);
  }
  if (!shard || shard.k < 1 || shard.n < 1 || shard.k > shard.n) return null;
  return { k: shard.k, n: shard.n, rest };
}

/**
 * Assign spec files to N workers balanced by duration.
 *
 * Unknown specs (not in `durations`) get the median known duration so a brand-new
 * spec is still distributed rather than dumped on worker 0. Returns N spec-path
 * lists, or `null` when balancing should not apply (fewer specs than workers — an
 * empty bin would make that worker run the WHOLE suite, so the caller must fall
 * back to `--shard` instead).
 */
export function assignWorkerSpecs(
  specFiles: string[],
  durations: Record<string, number>,
  n: number,
): string[][] | null {
  if (n < 1 || specFiles.length < n) return null;
  const fallback = median(Object.values(durations)) || 1000;
  const items = specFiles.map((spec) => ({ spec, ms: durations[spec] ?? fallback }));
  return binPackByDuration(items, n);
}
