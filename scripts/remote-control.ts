#!/usr/bin/env bun
// Start a Claude Code Remote Control session inside the t3-template-ralphex
// container so the current repo is reachable from claude.ai/code and the
// Claude mobile app. Reuses ralphex-dk's mount/credential machinery via
// `--dry-run` so the container inherits the same claude config, git config,
// project bind, and Doppler/GH tokens as `bin/ralphex-dk`.
//
// DESIGN: completely stateless. Every `bun run remote-control` spins up a
// fresh throwaway container (`docker run --rm`). `--stop` tears it down and
// Docker auto-removes it. Anything the session writes under `/workspace` is
// already bind-mounted to the host and survives. Anything else (session
// JSONL history, shell snapshots, caches) is ephemeral and goes with the
// container. If you want to preserve conversation context, summarize it into
// a file under `/workspace` before stopping.
//
// Usage:
//   bun run remote-control          start a fresh detached container, print URL
//   bun run remote-control --stop   stop + auto-remove the container
//   bun run remote-control --logs   docker logs -f the running container

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 't3-template-ralphex';
const worktreeName = path.basename(ROOT).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
const CONTAINER = `t3-remote-${worktreeName}`;
const NM_VOLUME = `t3app-${worktreeName}-nm`;
const URL_RE = /https:\/\/claude\.ai\/[^\s\u001b]+/;
const URL_WAIT_MS = 120_000;

function log(msg: string): void {
  console.error(`[remote-control] ${msg}`);
}

function isRunning(): boolean {
  const res = spawnSync('docker', ['ps', '-q', '-f', `name=^${CONTAINER}$`], { encoding: 'utf8' });
  return res.status === 0 && res.stdout.trim() !== '';
}

// --- flag dispatch -----------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--stop')) {
  if (!isRunning()) {
    log(`container ${CONTAINER} is not running.`);
    process.exit(0);
  }
  log(`stopping ${CONTAINER}...`);
  const stop = spawnSync('docker', ['stop', CONTAINER], { stdio: 'inherit' });
  process.exit(stop.status ?? 0);
}

if (args.includes('--logs')) {
  if (!isRunning()) {
    log(`container ${CONTAINER} is not running.`);
    process.exit(1);
  }
  const proc = spawn('docker', ['logs', '-f', CONTAINER], { stdio: 'inherit' });
  proc.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  // keep alive until the child exits
}

// --- start path --------------------------------------------------------------

if (isRunning()) {
  log(`container ${CONTAINER} is already running.`);
  log(`run \`bun run remote-control --stop\` first, or \`--logs\` to follow it.`);
  process.exit(1);
}

const imgInspect = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' });
if (imgInspect.status !== 0) {
  log(`image ${IMAGE} not found. Run 'bun run image:build' first.`);
  process.exit(1);
}

// claude Remote Control needs both the credentials (mounted by ralphex-dk via
// /mnt/claude-credentials.json → /home/app/.claude/.credentials.json) AND the
// user-level account data that normally lives in ~/.claude.json on the host.
// Inside the container claude reads that file from $CLAUDE_CONFIG_DIR/.claude.json
// (not $HOME/.claude.json). Without it:
//   "Unable to determine your organization for Remote Control eligibility."
// And without a projects["/workspace"].hasTrustDialogAccepted entry:
//   "Workspace not trusted. Please run `claude` in /workspace first."
// We stage a patched copy in $TMPDIR so the real host file is never mutated.
const extraVolumes: string[] = [`${NM_VOLUME}:/workspace/node_modules`];
const hostClaudeJson = path.join(process.env.HOME ?? '', '.claude.json');
if (fs.existsSync(hostClaudeJson)) {
  const data = JSON.parse(fs.readFileSync(hostClaudeJson, 'utf8')) as {
    projects?: Record<string, Record<string, unknown>>;
  };
  data.projects = data.projects ?? {};
  data.projects['/workspace'] = {
    ...(data.projects['/workspace'] ?? {}),
    allowedTools: [],
    hasTrustDialogAccepted: true,
    hasClaudeMdExternalIncludesApproved: true,
    hasClaudeMdExternalIncludesWarningShown: true,
    hasCompletedProjectOnboarding: true,
  };
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-control-'));
  const stagedClaudeJson = path.join(stageDir, '.claude.json');
  fs.writeFileSync(stagedClaudeJson, JSON.stringify(data));
  fs.chmodSync(stagedClaudeJson, 0o600);
  extraVolumes.push(`${stagedClaudeJson}:/home/app/.claude/.claude.json`);
}

const extraEnvs: string[] = [];
if (process.env.DOPPLER_TOKEN) extraEnvs.push('DOPPLER_TOKEN');
if (process.env.GH_TOKEN) extraEnvs.push('GH_TOKEN');

const wrapperEnv: NodeJS.ProcessEnv = {
  ...process.env,
  RALPHEX_IMAGE: IMAGE,
  RALPHEX_EXTRA_VOLUMES: extraVolumes.join(','),
  ...(extraEnvs.length ? { RALPHEX_EXTRA_ENV: extraEnvs.join(',') } : {}),
};

const dry = spawnSync(
  'bash',
  [path.join(ROOT, '.claude/scripts/ralphex-dk.sh'), '--dry-run'],
  { env: wrapperEnv, encoding: 'utf8' },
);
if (dry.status !== 0) {
  log('ralphex-dk --dry-run failed:');
  if (dry.stdout) console.error(dry.stdout);
  if (dry.stderr) console.error(dry.stderr);
  process.exit(1);
}

const dockerLine = ((dry.stdout ?? '') + '\n' + (dry.stderr ?? ''))
  .split('\n')
  .map((l) => l.trimEnd())
  .find((l) => l.trimStart().startsWith('docker run'));
if (!dockerLine) {
  log('could not find "docker run" line in ralphex-dk --dry-run output.');
  process.exit(1);
}

function shellSplit(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  let hasBuf = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') buf += s[++i] ?? '';
      else buf += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      hasBuf = true;
    } else if (c === '\\') {
      buf += s[++i] ?? '';
      hasBuf = true;
    } else if (/\s/.test(c)) {
      if (hasBuf) {
        out.push(buf);
        buf = '';
        hasBuf = false;
      }
    } else {
      buf += c;
      hasBuf = true;
    }
  }
  if (hasBuf) out.push(buf);
  return out;
}

const tokens = shellSplit(dockerLine.trim());

if (tokens[tokens.length - 1] !== '/srv/ralphex') {
  log('unexpected docker command shape (last token is not /srv/ralphex).');
  process.exit(1);
}
tokens.pop();

// Detached with pseudo-TTY: claude remote-control's bridge handshake times
// out after 15 s if stdout is not a TTY, so -t is mandatory even in -d mode.
// --spawn same-dir skips claude's interactive "1=same-dir / 2=worktree" prompt.
tokens.splice(2, 0, '-dt', '--name', CONTAINER);
// Suffix the session name with "(docker)" so a child spawned from inside
// a host-side parent `claude remote-control` (which defaults its session
// name to cwd basename) shows up in the claude.ai/code list as visually
// distinct from the parent. Without this, parent and child end up with
// identical display names and are indistinguishable on mobile.
const sessionDisplayName = `${path.basename(ROOT)} (docker)`;
tokens.push(
  'claude',
  'remote-control',
  '--permission-mode',
  'bypassPermissions',
  '--spawn',
  'same-dir',
  '--name',
  sessionDisplayName,
);

log(`container: ${CONTAINER}`);
log(`image:     ${IMAGE}`);
console.error('');

const [cmd, ...rest] = tokens;

// The bridge's first `POST /v1/environments/bridge` sometimes hangs (15s
// "timeout of 15000ms exceeded") or returns a transient 5xx on a cold run.
// claude has no internal retry for that call, so we watch the logs for those
// error signatures and — if we see one — stop the container, wait, and retry
// the whole docker run once. Second attempts are consistently reliable.
const TRANSIENT_RE = /Error: (timeout of \d+ms exceeded|Request failed with status code 5\d\d)/;

type RunResult = { ok: true } | { ok: false; transient: string | null };

async function tailForUrl(): Promise<RunResult> {
  log(`tailing logs for the session URL...`);
  log(`(use \`bun run remote-control --logs\` to follow again later)`);
  console.error('');

  return new Promise((resolve) => {
    const logs = spawn('docker', ['logs', '-f', CONTAINER]);
    let buffer = '';
    let done = false;
    const finish = (res: RunResult) => {
      if (done) return;
      done = true;
      try {
        logs.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolve(res);
    };
    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      process.stderr.write(text);
      buffer += text;
      const url = buffer.match(URL_RE);
      if (url) {
        console.error('');
        log(`session URL: ${url[0]}`);
        log(`container ${CONTAINER} runs in the background; --stop when done.`);
        finish({ ok: true });
        return;
      }
      const transient = buffer.match(TRANSIENT_RE);
      if (transient) {
        finish({ ok: false, transient: transient[0] });
      }
    };
    logs.stdout?.on('data', onChunk);
    logs.stderr?.on('data', onChunk);
    logs.on('exit', () => {
      if (!done) {
        finish({ ok: false, transient: null });
      }
    });
    setTimeout(() => {
      if (!done) {
        console.error('');
        log(`timed out waiting for session URL after ${URL_WAIT_MS / 1000}s.`);
        finish({ ok: false, transient: null });
      }
    }, URL_WAIT_MS).unref();
  });
}

function runContainer(): boolean {
  const run = spawnSync(cmd!, rest, { stdio: ['ignore', 'pipe', 'inherit'] });
  if (run.status !== 0) {
    log(`docker run failed with exit ${run.status}`);
    return false;
  }
  return true;
}

function waitForContainerGone(maxMs = 10_000): void {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = spawnSync(
      'docker',
      ['ps', '-a', '-q', '-f', `name=^${CONTAINER}$`],
      { encoding: 'utf8' },
    );
    if (res.stdout.trim() === '') return;
    const end = Date.now() + 200;
    while (Date.now() < end) {
      // tiny busy wait to avoid pulling in timers/promise APIs
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function startWithRetry(maxAttempts = 4): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`attempt ${attempt}/${maxAttempts}: docker run...`);
    if (!runContainer()) {
      // docker run itself failed (e.g. name conflict). Try to clean up.
      spawnSync('docker', ['stop', CONTAINER], { stdio: 'ignore' });
      waitForContainerGone();
      if (attempt < maxAttempts) {
        await sleep(2000);
        continue;
      }
      return false;
    }
    const result = await tailForUrl();
    if (result.ok) return true;

    // Cleanup this attempt's container before retrying.
    spawnSync('docker', ['stop', CONTAINER], { stdio: 'ignore' });
    waitForContainerGone();

    if (attempt < maxAttempts) {
      if (result.transient) {
        log(`transient bridge failure (${result.transient}); retrying in 3s...`);
      } else {
        log(`no URL seen; retrying in 3s...`);
      }
      await sleep(3000);
      continue;
    }
    log(`all ${maxAttempts} attempts failed; giving up.`);
    log(`try again in a minute — the bridge backend is sometimes flaky on cold runs.`);
    return false;
  }
  return false;
}

const ok = await startWithRetry();
process.exit(ok ? 0 : 1);
