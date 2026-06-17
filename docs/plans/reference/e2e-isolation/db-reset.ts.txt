import { execSync } from "child_process";

import { E2E_DATABASE_URL } from "./db-url";

/**
 * Truncate application + auth tables so the next signup creates a fresh user.
 * Run this in a test.beforeAll when a spec needs a known-empty DB or a specific
 * "first user" state.
 *
 * Under the per-worker isolation runner each worker already has its own cloned
 * DB, and specs sign up unique users — so MOST specs never need this. Prefer
 * unique per-test data over a global reset. Provided for the occasional spec
 * that must assert on an empty/first-user state.
 *
 * Targets E2E_DATABASE_URL (the per-worker DB under the isolation runner; the
 * container-default `app` otherwise), never a hardcoded `…/app`.
 */
export function resetAppData() {
  // public schema (ZenStack models). CASCADE resolves FK order.
  const publicTables = ['"Project"', '"Membership"', '"Organization"', '"User"'];
  const publicSql = `TRUNCATE ${publicTables.join(", ")} CASCADE;`;
  execSync(`psql ${E2E_DATABASE_URL} -c '${publicSql}'`, { stdio: "ignore" });

  // auth schema (Better Auth core tables) — schema-qualified because
  // E2E_DATABASE_URL has no auth search_path. Names are Better Auth's defaults;
  // confirm against `bun run auth:generate` output if the auth schema changes.
  const authTables = [
    'auth."session"',
    'auth."account"',
    'auth."verification"',
    'auth."user"',
  ];
  const authSql = `TRUNCATE ${authTables.join(", ")} CASCADE;`;
  execSync(`psql ${E2E_DATABASE_URL} -c '${authSql}'`, { stdio: "ignore" });
}
