import { type AuthType, ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";
import { PolicyPlugin } from "@zenstackhq/plugin-policy";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { schema } from "@/lib/zenstack/generated/schema";

/**
 * The policy-enforcing client. In ZenStack v3 the `@@allow`/`@@deny` rules in
 * schema.zmodel are enforced ONLY by `PolicyPlugin` — a client without it
 * ignores them entirely. Everything user-driven (`/api/model`, server
 * components via `bindDbAuth`) must go through this client. Trusted
 * server-side writes the schema forbids use `adminDb` (src/lib/admin-db.ts).
 */
function createDbClient(pool: Pool) {
  return new ZenStackClient(schema, {
    dialect: new PostgresDialect({
      pool,
    }),
    plugins: [new PolicyPlugin()],
  });
}

const globalForDatabase = globalThis as {
  appPool?: Pool;
  appDb?: ReturnType<typeof createDbClient>;
};

export const appPool =
  globalForDatabase.appPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

export const db =
  globalForDatabase.appDb ??
  createDbClient(appPool);

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.appPool = appPool;
  globalForDatabase.appDb = db;
}

export type DbAuthContext = AuthType<typeof schema>;

export function bindDbAuth(auth: DbAuthContext | undefined) {
  return auth ? db.$setAuth(auth) : db.$setAuth(undefined);
}
