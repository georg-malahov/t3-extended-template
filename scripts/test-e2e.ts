#!/usr/bin/env bun
/**
 * test:e2e — the single E2E command. Full per-worker isolation, prod build,
 * retries=0. This is the ONLY local way to run the suite.
 *
 * ## One command, any state
 *
 *   bun run test:e2e                       # 4 isolated workers (default)
 *   bun run test:e2e --workers=7           # override the worker count
 *   bun run test:e2e --workers=1 tests/e2e/auth.spec.ts   # one spec, one worker
 *   bun run test:e2e --skip-build          # reuse the existing .next build (fast iterate)
 *
 * Run it from the host. If the dev container is not running it is started for
 * you (`bun run up`); no manual container start needed. You can also pass the
 * worker count via the E2E_WORKERS env var — the `--workers=N` flag wins when
 * both are set.
 *
 * ## What each worker gets
 *
 * Spins up N independent stacks. Worker K gets:
 *   - its own Postgres database `app_wK` (public + auth schemas, freshly migrated + seeded)
 *   - its own production server (`next start`) on port BASE_PORT+K
 *   - its own Playwright process running shard K/N against that server
 *
 * Each worker is fully isolated: DB and server are per-worker.
 *
 * This removes the shared-DB / shared-server coupling that forced retries.
 * Runs with `--retries=0` by default to PROVE true no-flakiness (set E2E_RETRIES
 * to relax).
 *
 * ## CLI flags (parsed by parseRunnerArgs; everything else is forwarded to Playwright)
 *   --workers=N | --workers N   number of isolated stacks (overrides E2E_WORKERS)
 *   --skip-build                reuse the existing .next build (E2E_SKIP_BUILD=1)
 *   --record-durations          after the run, (re)write tests/e2e/.spec-durations.json
 *                               from the per-shard logs (E2E_RECORD_DURATIONS=1)
 *   --no-balance                force count-based --shard instead of duration
 *                               bin-packing (E2E_NO_BALANCE=1)
 *
 * ## Env knobs
 *   E2E_WORKERS          number of isolated stacks (default 4; --workers wins)
 *   E2E_BASE_PORT        first server port (default 3100)
 *   E2E_RETRIES          Playwright retries per shard (default 0)
 *   E2E_SKIP_BUILD       reuse an existing .next build (default: build)
 *   E2E_RECORD_DURATIONS set to "1" to rewrite tests/e2e/.spec-durations.json
 *   E2E_NO_BALANCE       set to "1" to force count-based --shard (no bin-packing)
 *
 * ## CI
 * In CI the workflow builds + starts a single prod server itself, then runs
 * `bun run test:e2e -- --shard=K/N` inside the container with
 * PLAYWRIGHT_PROD_SERVER=1. That env marks the "a server is already running"
 * path: we skip the orchestrator and just run Playwright against it
 * (runCiPassthrough). runCiPassthrough rewrites the count-based `--shard=K/N`
 * into our duration-balanced bin K — deterministic across the matrix machines.
 * `--no-balance` keeps native `--shard`.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";

import { getContainerName, isContainerRunning, sleep } from "./container";
import {
  assignWorkerSpecs,
  extractShard,
  hasSpecFilter,
  parseSpecDurations,
} from "./spec-balance";

/**
 * Parsed form of the runner's CLI args.
 *
 * `workers`, `skipBuild`, `recordDurations`, `noBalance` are consumed by the
 * runner itself; `passthrough` is everything left over (spec globs, `--shard=K/N`,
 * etc.) which is forwarded verbatim to `playwright test`.
 */
export interface ParsedRunnerArgs {
  workers?: number;
  skipBuild: boolean;
  recordDurations: boolean;
  noBalance: boolean;
  passthrough: string[];
}

/**
 * Parse the runner's own flags out of an argv slice, leaving everything else as
 * Playwright passthrough.
 *
 * Recognised: `--workers=N`, `--workers N`, `--skip-build`, `--record-durations`,
 * `--no-balance`. A `--workers` without a positive-integer value is dropped (not
 * forwarded) so a typo never reaches Playwright as a stray arg. Pure function —
 * unit-tested.
 */
export function parseRunnerArgs(argv: string[]): ParsedRunnerArgs {
  const passthrough: string[] = [];
  let workers: number | undefined;
  let skipBuild = false;
  let recordDurations = false;
  let noBalance = false;

  const toWorkers = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }
    if (arg === "--record-durations") {
      recordDurations = true;
      continue;
    }
    if (arg === "--no-balance") {
      noBalance = true;
      continue;
    }
    const eq = /^--workers=(.*)$/.exec(arg);
    if (eq) {
      workers = toWorkers(eq[1]) ?? workers;
      continue;
    }
    if (arg === "--workers") {
      const parsed = toWorkers(argv[i + 1]);
      if (parsed !== undefined) {
        workers = parsed;
        i++; // consume the value token
      }
      // malformed (missing/non-numeric value): drop the flag, keep nothing
      continue;
    }
    passthrough.push(arg);
  }

  return {
    workers,
    skipBuild,
    recordDurations,
    noBalance,
    passthrough,
  };
}

const parsedArgs = parseRunnerArgs(process.argv.slice(2));
const passthrough = parsedArgs.passthrough;
// Translate the parsed flags into env vars up front, so they take effect on
// EVERY entry path — not just the host wrapper. The in-container orchestrator
// (runInside) reads these env vars; without this, `bun run dx bun run test:e2e
// --record-durations` (which enters the container directly, bypassing the host
// wrapper) would silently drop the flag. The host wrapper also forwards these
// env vars into its `docker exec`, so the values propagate either way.
if (parsedArgs.skipBuild) process.env.E2E_SKIP_BUILD = "1";
if (parsedArgs.recordDurations) process.env.E2E_RECORD_DURATIONS = "1";
if (parsedArgs.noBalance) process.env.E2E_NO_BALANCE = "1";
// Worker count resolution: --workers flag wins, then E2E_WORKERS env, then 4.
// Default 4 — a reliable sweet spot. Bump with --workers=N as needed.
const N = Math.max(
  1,
  parsedArgs.workers ?? Number(process.env.E2E_WORKERS ?? "4"),
);
const BASE_PORT = Number(process.env.E2E_BASE_PORT ?? "3100");
const RETRIES = process.env.E2E_RETRIES ?? "0";
const PSQL = ["psql", "-U", "postgres", "-h", "localhost"];
/** Fully-migrated template DB that every worker DB is cloned from. */
const TEMPLATE_DB = "app_template";
/** Committed per-spec duration map used for duration-aware shard balancing. */
const DURATIONS_PATH = "tests/e2e/.spec-durations.json";

/** Truncate a log file before using it as a spawn sink (Bun.file appends). */
function freshLog(path: string): ReturnType<typeof Bun.file> {
  writeFileSync(path, "");
  return Bun.file(path);
}

// Guard execution so this module can be imported by unit tests (scripts/*.test.ts)
// without triggering the runner. `import.meta.main` is true only when this file
// is the Bun entry point (i.e. `bun run test:e2e`). In vitest/vite the property
// is absent/falsy, so the block is skipped and only exports are evaluated.
if (import.meta.main) {
  // Entry detection order is critical:
  // (1) PLAYWRIGHT_PROD_SERVER=1 → CI in-container path (check FIRST so CI's
  //     `docker exec … test:e2e` never falls into the host-wrapper branch)
  // (2) RALPHEX_DOCKER=1 → inside container, full orchestrator
  // (3) else → host wrapper (start container if needed, docker exec)
  if (process.env.PLAYWRIGHT_PROD_SERVER === "1") {
    await runCiPassthrough();
  } else if (process.env.RALPHEX_DOCKER === "1") {
    await runInside();
  } else {
    await runHostWrapper();
  }
}

/**
 * Run Playwright against an already-running prod server (CI / PLAYWRIGHT_PROD_SERVER=1).
 *
 * Tee output to PID 1's stdout so `docker logs -f` / `bun run logs` show the live
 * run, and propagate Playwright's exit code through the pipe (pipefail).
 */
async function runCiPassthrough(): Promise<void> {
  // CI passes `--shard=K/N` (Playwright's count-based, duration-blind split). Replace
  // it with our duration-balanced bin K so CI shards are evenly loaded too. LPT over
  // the committed map is deterministic, so every shard machine computes the identical
  // partition and runs its disjoint slice.
  let args = passthrough;
  const shard = process.env.E2E_NO_BALANCE === "1" ? null : extractShard(passthrough);
  if (shard && !hasSpecFilter(shard.rest)) {
    const bin = loadBalancedBins(shard.n)?.[shard.k - 1];
    if (bin && bin.length) {
      args = [...shard.rest, ...bin];
      console.log(
        `[ci] duration-balanced shard ${shard.k}/${shard.n}: ${bin.length} specs (replacing count-based --shard)`,
      );
    }
  }
  // POSIX single-quote escaping: args originate from trusted CLI/CI input, not
  // external/untrusted sources, so building a bash -c string here is safe.
  const quoted = args
    .map((a) => `'${a.replace(/'/g, `'\\''`)}'`)
    .join(" ");
  // /proc/1/fd/1 tees output to the container's PID-1 stdout (visible in `docker logs`).
  // Fall back to plain cat on systems where that path doesn't exist (e.g. macOS dev runs).
  const teeTarget = existsSync("/proc/1/fd/1") ? "/proc/1/fd/1" : "/dev/stdout";
  const result = Bun.spawnSync(
    [
      "bash",
      "-c",
      `set -o pipefail; bunx playwright test ${quoted} 2>&1 | tee ${teeTarget}`,
    ],
    { stdout: "inherit", stderr: "inherit", stdin: "inherit" },
  );
  process.exit(result.exitCode ?? 1);
}

// ───────────────────────────── in-container ──────────────────────────────────

function dbName(k: number) {
  return `app_w${k}`;
}
function dbUrl(k: number) {
  return `postgresql://postgres@localhost/${dbName(k)}`;
}
function authUrl(k: number) {
  return `postgresql://postgres@localhost/${dbName(k)}?options=-csearch_path%3Dauth`;
}
function port(k: number) {
  return BASE_PORT + k;
}

async function runInside(): Promise<void> {
  console.log(`[isolated] ${N} worker stacks, ports ${port(0)}..${port(N - 1)}, retries=${RETRIES}`);

  await buildIfNeeded();
  await provisionDatabases();
  const servers = startServers();
  const ready = await waitForServers();
  if (!ready) {
    console.error("[isolated] one or more servers failed to start");
    stopServers(servers);
    process.exit(1);
  }

  const codes = await runShards();

  if (process.env.E2E_RECORD_DURATIONS === "1") recordSpecDurations();

  stopServers(servers);

  const failed = codes.map((c, k) => ({ k, c })).filter((x) => x.c !== 0);
  console.log("\n[isolated] ── shard results ──");
  codes.forEach((c, k) => console.log(`  shard ${k}: ${c === 0 ? "PASS" : `FAIL (exit ${c})`}`));
  if (failed.length) {
    console.error(`[isolated] ${failed.length}/${N} shard(s) failed`);
    process.exit(1);
  }
  console.log(`[isolated] all ${N} shards green`);
  process.exit(0);
}

async function buildIfNeeded() {
  if (process.env.E2E_SKIP_BUILD === "1") {
    console.log("[isolated] E2E_SKIP_BUILD=1 — reusing existing .next build");
    return;
  }
  console.log("[isolated] building production bundle…");
  // Use `bunx next build` (a FULL standard build) so `next start` has the
  // manifests it needs.
  const build = Bun.spawnSync(["bunx", "next", "build"], {
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });
  if (build.exitCode !== 0) {
    console.error("[isolated] build failed");
    process.exit(build.exitCode ?? 1);
  }
}

/**
 * Provision the N worker databases via a migrate-once / clone-N strategy.
 *
 * `bun run db:migrate` (`zen migrate deploy`) compiles the schema to a SHARED
 * temp file `zenstack/~schema.prisma` in the workspace on every invocation, so
 * running it N times in parallel races on that one file — intermittently at N=4,
 * almost always at N≥5. So we migrate exactly ONE template DB (serial — no race),
 * then clone each worker DB from it with `CREATE DATABASE … TEMPLATE`, which copies
 * a fully-migrated DB at the file level: no `zen`, no temp file, near-instant, and
 * provisioning time is flat in N instead of N concurrent migrations.
 */
async function provisionDatabases() {
  console.log(`[isolated] provisioning template DB + ${N} worker clone(s)…`);
  await provisionTemplate();
  // Clones are serialized: CREATE DATABASE … TEMPLATE requires the source to
  // have no other sessions, and two concurrent clones of the same template
  // conflict. Each clone is a fast file copy, so serial is cheap.
  for (let k = 0; k < N; k++) cloneWorkerDb(k);
  // Drop Next's persisted data cache. App pages may cache content via
  // `unstable_cache` in `.next/cache` (disk). We re-seed the template every run,
  // so a cache persisted from a prior run (especially under --skip-build, which
  // reuses .next) could surface stale content → cascading failures on the 2nd+
  // run. A full `next build` starts cold, which is why single full-build runs are
  // green — clearing here makes repeated --skip-build runs green too.
  rmSync(".next/cache", { recursive: true, force: true });
  console.log("[isolated] databases ready (data cache cleared)");
}

/**
 * Build the fresh, fully-migrated (and seeded) template DB (public + auth schemas).
 *
 * Migration order:
 *   db:ensure-auth-schema → auth:migrate → db:migrate (zen) → db:seed
 *
 * Seed INTO the template so every clone has data from the start. (The template's
 * seed is a no-op on a fresh DB with no users — kept for parity and forward
 * compatibility once seeded specs are added.)
 */
async function provisionTemplate() {
  run([...PSQL, "-d", "app", "-c", `DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`]);
  run([...PSQL, "-d", "app", "-c", `CREATE DATABASE ${TEMPLATE_DB}`]);
  // Create the auth schema before Better Auth migration
  run([...PSQL, "-d", TEMPLATE_DB, "-c", "CREATE SCHEMA IF NOT EXISTS auth"]);

  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres@localhost/${TEMPLATE_DB}`,
    AUTH_DATABASE_URL: `postgresql://postgres@localhost/${TEMPLATE_DB}?options=-csearch_path%3Dauth`,
  };

  // Order matters:
  // 1. Ensure auth schema script (idempotent)
  await spawn(["bun", "run", "db:ensure-auth-schema"], env, "provision-template-ensure-auth");
  // 2. Better Auth schema migration
  await spawn(["bun", "run", "auth:migrate"], env, "provision-template-auth");
  // 3. ZenStack / Prisma migrations (public schema)
  await spawn(["bun", "run", "db:migrate"], env, "provision-template-db");
  // 4. Seed the template so every clone has data
  await spawn(["bun", "run", "db:seed"], env, "provision-template-seed");
}

/** Drop + recreate worker K's DB as an instant clone of the template. */
function cloneWorkerDb(k: number) {
  const name = dbName(k);
  run([...PSQL, "-d", "app", "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`]);
  // Terminate any lingering sessions on the template so the clone isn't blocked
  // by "source database is being accessed by other users".
  run([...PSQL, "-d", "app", "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMPLATE_DB}' AND pid <> pg_backend_pid()`]);
  run([...PSQL, "-d", "app", "-c", `CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`]);
}

function startServers() {
  console.log(`[isolated] starting ${N} production servers…`);
  return Array.from({ length: N }, (_, k) => {
    const p = port(k);
    const proc = Bun.spawn(["bunx", "next", "start", "-p", String(p)], {
      stdout: freshLog(`/tmp/isolated-srv-w${k}.log`),
      stderr: freshLog(`/tmp/isolated-srv-w${k}.log`),
      env: {
        ...process.env,
        NODE_ENV: "production",
        // Marks the server as an E2E target — auth.ts reads this to disable
        // Better Auth's prod rate limiter (the suite signs in many times per
        // worker and would otherwise hit "Too many requests").
        E2E: "1",
        DATABASE_URL: dbUrl(k),
        AUTH_DATABASE_URL: authUrl(k),
        APP_URL: `http://localhost:${p}`,
        BETTER_AUTH_URL: `http://localhost:${p}`,
      },
    });
    return proc;
  });
}

async function waitForServers(): Promise<boolean> {
  const deadline = Date.now() + 120_000;
  const pending = new Set(Array.from({ length: N }, (_, k) => k));
  while (pending.size && Date.now() < deadline) {
    for (const k of [...pending]) {
      const ok = Bun.spawnSync(
        ["curl", "-sf", "-o", "/dev/null", `http://localhost:${port(k)}`],
        { stdout: "pipe", stderr: "pipe" },
      ).exitCode === 0;
      if (ok) {
        pending.delete(k);
        console.log(`[isolated] server w${k} ready on :${port(k)}`);
      }
    }
    if (pending.size) await sleep(1000);
  }
  return pending.size === 0;
}

/**
 * Read the committed duration map + glob the current specs, bin-pack into `n` groups.
 * Returns null if the map is missing/unreadable or there are fewer specs than `n`.
 * Shared by the local runner (balancedSpecLists) and CI (runCiPassthrough) so both
 * balance identically off the same committed data.
 */
function loadBalancedBins(n: number): string[][] | null {
  if (!existsSync(DURATIONS_PATH)) return null;
  let durations: Record<string, number>;
  try {
    durations = JSON.parse(readFileSync(DURATIONS_PATH, "utf8")) as Record<string, number>;
  } catch {
    return null;
  }
  const specFiles = readdirSync("tests/e2e")
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `tests/e2e/${f}`)
    .sort();
  return assignWorkerSpecs(specFiles, durations, n);
}

function balancedSpecLists(): string[][] | null {
  if (process.env.E2E_NO_BALANCE === "1") return null;
  if (N < 2) return null;
  if (hasSpecFilter(passthrough)) return null;
  return loadBalancedBins(N);
}

/**
 * Build the `playwright test` args for worker K.
 *
 * If `balanced` is provided, the worker runs its explicit duration-balanced spec
 * list (no `--shard`). Otherwise: uniform shard (`--shard=k/N`).
 *
 * Per-shard --output: all N shards share cwd=/workspace and each runs --workers=1,
 * so without this they'd all write to the SAME `test-results/.playwright-artifacts-0/`
 * dir and clobber each other's trace resources. Isolating the output dir per shard
 * removes that collision.
 */
function shardArgs(k: number, balanced: string[][] | null): string[] {
  const base = ["playwright", "test", ...passthrough, "--workers=1",
    `--retries=${RETRIES}`, "--output", `test-results/w${k}`];
  if (balanced) return [...base, ...balanced[k]];
  return [...base, `--shard=${k + 1}/${N}`];
}

async function runShards(): Promise<number[]> {
  const balanced = balancedSpecLists();
  const mode = balanced
    ? `duration-balanced (per-worker spec lists from ${DURATIONS_PATH})`
    : "uniform shard (sharded across all workers)";
  console.log(`[isolated] running ${N} Playwright processes — ${mode}`);
  if (balanced) balanced.forEach((l, k) => console.log(`  worker ${k}: ${l.length} specs`));
  const procs = Array.from({ length: N }, (_, k) => {
    const args = shardArgs(k, balanced);
    return Bun.spawn(["bunx", ...args], {
      stdout: freshLog(`/tmp/isolated-shard-w${k}.log`),
      stderr: freshLog(`/tmp/isolated-shard-w${k}.log`),
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: `http://localhost:${port(k)}`,
        PLAYWRIGHT_PROD_SERVER: "1",
        // Point the SHARD's own process at this worker's DB too — specs that
        // query/seed Postgres directly (via `pg`, the psql-seeding specs,
        // db-reset) read process.env.DATABASE_URL. Without this they hit the
        // container-default `app` DB while the server uses `app_w${k}`, so their
        // rows never line up. Mirrors startServers().
        DATABASE_URL: dbUrl(k),
        AUTH_DATABASE_URL: authUrl(k),
        E2E: "1",
        CI: "1",
      },
    });
  });
  return Promise.all(procs.map((p) => p.exited));
}

function stopServers(servers: ReturnType<typeof startServers>) {
  for (const s of servers) s.kill();
}

/**
 * Parse the per-shard run logs (list-reporter stdout) and (re)write the committed
 * per-spec duration map used by balancedSpecLists(). Each spec runs on exactly one
 * worker, so summing the per-shard maps is collision-free. Sorted keys + integer
 * ms keep the committed JSON diff-friendly.
 */
function recordSpecDurations() {
  const merged: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    const logPath = `/tmp/isolated-shard-w${k}.log`;
    if (!existsSync(logPath)) continue;
    const parsed = parseSpecDurations(readFileSync(logPath, "utf8"));
    for (const [spec, ms] of Object.entries(parsed)) {
      merged[spec] = (merged[spec] ?? 0) + ms;
    }
  }
  const specs = Object.keys(merged).sort();
  if (!specs.length) {
    console.warn("[isolated] --record-durations: no spec durations parsed from logs");
    return;
  }
  const sorted = Object.fromEntries(specs.map((s) => [s, Math.round(merged[s])]));
  writeFileSync(DURATIONS_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`[isolated] recorded ${specs.length} spec durations → ${DURATIONS_PATH}`);
}

// ───────────────────────────── helpers ───────────────────────────────────────

function run(cmd: string[]) {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`cmd failed: ${cmd.join(" ")}\n${r.stderr.toString()}`);
  }
}

async function spawn(cmd: string[], env: Record<string, string | undefined>, label: string) {
  const proc = Bun.spawn(cmd, {
    stdout: freshLog(`/tmp/isolated-${label}.log`),
    stderr: freshLog(`/tmp/isolated-${label}.log`),
    env,
  });
  const code = await proc.exited;
  if (code !== 0) {
    const log = await Bun.file(`/tmp/isolated-${label}.log`).text();
    throw new Error(`${label} failed (exit ${code}):\n${log.slice(-2000)}`);
  }
}

// ───────────────────────────── host wrapper ──────────────────────────────────

async function runHostWrapper(): Promise<void> {
  const container = getContainerName();
  if (!isContainerRunning()) {
    console.log(`Container ${container} not running — starting via 'bun run up'…`);
    const up = Bun.spawnSync(["bun", "run", "up"], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    if (up.exitCode !== 0) process.exit(up.exitCode ?? 1);
  }

  // (CLI flags were already translated into E2E_* env vars at module scope;
  // the forwarding loop below passes them into the container.)
  // The dev/ralphex image bakes in `ENV RALPHEX_DOCKER=1`
  // (.claude/docker/Dockerfile.ralphex), so the `docker exec` below lands on the
  // in-container orchestrator (runInside) rather than recursing into the host
  // wrapper. No need to pass RALPHEX_DOCKER explicitly.
  const dockerArgs = ["docker", "exec"];
  if (process.stdin.isTTY) dockerArgs.push("-it");
  for (const v of [
    "E2E_WORKERS",
    "E2E_BASE_PORT",
    "E2E_RETRIES",
    "E2E_SKIP_BUILD",
    "E2E_RECORD_DURATIONS",
    "E2E_NO_BALANCE",
    "TRACE_ALL",
  ]) {
    if (process.env[v]) dockerArgs.push("-e", `${v}=${process.env[v]}`);
  }
  // Always pass the resolved worker count so the in-container orchestrator
  // sees the same N even when only `--workers=N` was passed on the host.
  dockerArgs.push("-e", `E2E_WORKERS=${N}`);

  dockerArgs.push(container, "bun", "run", "test:e2e", ...passthrough);
  const result = Bun.spawnSync(dockerArgs, {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  process.exit(result.exitCode ?? 1);
}
