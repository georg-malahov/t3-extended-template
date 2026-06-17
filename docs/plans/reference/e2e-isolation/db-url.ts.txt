/**
 * Connection string for tests that talk to Postgres directly (via `pg` or by
 * shelling out to `psql`).
 *
 * Under the per-worker isolation runner each shard's process is given
 * `DATABASE_URL=postgresql://postgres@localhost/app_w<k>` (see
 * scripts/test-e2e.ts → runShards), so direct DB access lands on the SAME
 * database the worker's server uses. Falls back to the container-default `app`
 * DB for the dev-server / CI single-server paths where no per-worker override
 * is set.
 */
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres@localhost/app";
