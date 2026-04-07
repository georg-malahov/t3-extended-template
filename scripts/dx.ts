#!/usr/bin/env bun
/**
 * dx — Run a command inside the running Docker container.
 *
 * Usage:
 *   bun run dx bash                     # interactive shell
 *   bun run dx bun run lint             # lint inside container
 *   bun run dx bun run test:e2e         # E2E tests inside container
 *
 * Automatically adds -it flags when stdin is a TTY.
 * Pass -e KEY=VALUE before the command to inject env vars.
 */
import { requireContainer } from "./container";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: bun run dx <command> [args...]");
  console.error("Examples:");
  console.error("  bun run dx bash");
  console.error("  bun run dx bun run lint");
  console.error("  bun run dx bun run test:e2e");
  process.exit(1);
}

const container = requireContainer();

// Build docker exec command
const dockerArgs = ["docker", "exec"];

// Extract -e flags from the beginning of args
const envFlags: string[] = [];
const cmdArgs: string[] = [];
let i = 0;
while (i < args.length) {
  if (args[i] === "-e" && i + 1 < args.length) {
    envFlags.push("-e", args[i + 1]);
    i += 2;
  } else {
    cmdArgs.push(...args.slice(i));
    break;
  }
}

if (process.stdin.isTTY) dockerArgs.push("-it");
dockerArgs.push(...envFlags, container, ...cmdArgs);

const proc = Bun.spawnSync(dockerArgs, {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

process.exit(proc.exitCode);
