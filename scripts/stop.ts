#!/usr/bin/env bun
/**
 * stop — Stop and remove the Docker dev container + its node_modules volume.
 */
import { unlinkSync } from "fs";
import { getContainerName, getVolumeName } from "./container";

const container = getContainerName();
const volume = getVolumeName();

Bun.spawnSync(["docker", "rm", "-f", container], {
  stdout: "pipe",
  stderr: "pipe",
});
Bun.spawnSync(["docker", "volume", "rm", volume], {
  stdout: "pipe",
  stderr: "pipe",
});

try {
  unlinkSync(".env.docker");
} catch {
  // ignore if file doesn't exist
}

console.log(`Stopped ${container}`);
