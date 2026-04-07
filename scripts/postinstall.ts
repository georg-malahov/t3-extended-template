#!/usr/bin/env bun
/**
 * postinstall — Deduplicate chevrotain to fix ZenStack's "non exhaustive match" error.
 *
 * Bun creates separate copies of chevrotain@11.0.3 under langium/ and
 * chevrotain-allstar/ even though they need the same version. Since these
 * are different module instances, chevrotain's instanceof checks fail.
 *
 * This script replaces the nested copies with symlinks to the top-level
 * chevrotain, ensuring a single shared module instance.
 */
import { existsSync, rmSync, symlinkSync, realpathSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dir, "..", "node_modules");
const topLevel = resolve(root, "chevrotain");

const nestedPaths = [
  resolve(root, "langium", "node_modules", "chevrotain"),
  resolve(root, "chevrotain-allstar", "node_modules", "chevrotain"),
];

if (!existsSync(topLevel)) {
  // Nothing to dedupe
  process.exit(0);
}

for (const nested of nestedPaths) {
  if (!existsSync(nested)) continue;

  // Skip if already a symlink to the top-level copy
  try {
    if (realpathSync(nested) === realpathSync(topLevel)) continue;
  } catch {
    // realpathSync can throw on broken symlinks
  }

  rmSync(nested, { recursive: true });
  symlinkSync(topLevel, nested);
}
