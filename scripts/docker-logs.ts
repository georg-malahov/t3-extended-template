#!/usr/bin/env bun
/**
 * docker-logs — Stream logs from the running Docker container.
 */
import { requireContainer } from "./container";

const container = requireContainer();
const proc = Bun.spawnSync(["docker", "logs", "-f", container], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
process.exit(proc.exitCode);
