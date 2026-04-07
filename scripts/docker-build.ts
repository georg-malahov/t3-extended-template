#!/usr/bin/env bun
/**
 * docker-build — Build the t3-template-ralphex Docker image.
 * Also cleans up stale node_modules volumes (they'll be repopulated on next run).
 */
import { IMAGE } from "./container";

console.log(`Building ${IMAGE}...`);

const build = Bun.spawnSync(
  ["docker", "build", "-t", IMAGE, "-f", ".claude/docker/Dockerfile.ralphex", "."],
  { stdout: "inherit", stderr: "inherit", stdin: "inherit" },
);

if (build.exitCode !== 0) {
  process.exit(build.exitCode);
}

// Remove stale node_modules volumes (will be repopulated on next run)
console.log("Removing stale node_modules volumes...");
const volumes = Bun.spawnSync(
  ["docker", "volume", "ls", "-q", "--filter", "name=-nm$"],
  { stdout: "pipe" },
);
const volumeList = volumes.stdout
  .toString()
  .trim()
  .split("\n")
  .filter((v) => v.includes("t3app"));

for (const vol of volumeList) {
  Bun.spawnSync(["docker", "volume", "rm", vol], {
    stdout: "pipe",
    stderr: "pipe",
  });
}

console.log("Done.");
