/**
 * Shared Docker container utilities.
 * Used by dev.ts, stop.ts, dx.ts, and docker-build.ts.
 */
import { basename } from "path";

export const IMAGE = "t3-template-ralphex";

/** Derive a unique container name from the working directory basename. */
export function getContainerName(): string {
  const dir = basename(process.cwd())
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
  return `t3app-${dir}`;
}

/** Named volume for node_modules (isolated per worktree). */
export function getVolumeName(): string {
  return `${getContainerName()}-nm`;
}

/** Check if the container is currently running. */
export function isContainerRunning(): boolean {
  const result = Bun.spawnSync(
    ["docker", "inspect", "-f", "{{.State.Running}}", getContainerName()],
    { stdout: "pipe", stderr: "pipe" },
  );
  return result.stdout.toString().trim() === "true";
}

/** Require a running container or exit with an error. Returns the container name. */
export function requireContainer(): string {
  const name = getContainerName();
  if (!isContainerRunning()) {
    console.error(
      `Error: container ${name} is not running. Start it with: bun run up`,
    );
    process.exit(1);
  }
  return name;
}

/** Sleep helper. */
export function sleep(ms: number): Promise<void> {
  return Bun.sleep(ms);
}

/** Poll a check function until it returns true or timeout. */
export async function waitFor(
  check: () => boolean,
  maxIterations: number,
  intervalMs: number,
): Promise<boolean> {
  for (let i = 0; i < maxIterations; i++) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return false;
}
