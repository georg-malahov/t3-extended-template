import { ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";

import { appPool } from "@/lib/db";
import { schema } from "@/lib/zenstack/generated/schema";

function createAdminDb() {
  return new ZenStackClient(schema, {
    dialect: new PostgresDialect({ pool: appPool }),
  });
}

const globalForAdminDb = globalThis as {
  adminDb?: ReturnType<typeof createAdminDb>;
};

/**
 * DB client WITHOUT the PolicyPlugin — for trusted server-side writes only.
 *
 * The schema deliberately forbids some writes through the policy client (and
 * therefore through `/api/model`): creating a User or an Organization,
 * creating/updating a Membership, changing `User.id` / `User.email`. Those
 * writes happen here, and ONLY after the caller has been authorized on the
 * server:
 *
 * - `src/lib/provisioning.ts` — the public.User mirror of the Better Auth
 *   account and the user's own first workspace with them as OWNER.
 *
 * Never pass request input straight into this client, and never hand it to
 * the `/api/model` handler.
 */
export const adminDb = globalForAdminDb.adminDb ?? createAdminDb();

if (process.env.NODE_ENV !== "production") {
  globalForAdminDb.adminDb = adminDb;
}
