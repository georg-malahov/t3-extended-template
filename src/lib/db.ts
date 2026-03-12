import { type AuthType, ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { schema } from "@/lib/zenstack/generated/schema";

function createDbClient(pool: Pool) {
  return new ZenStackClient(schema, {
    dialect: new PostgresDialect({
      pool,
    }),
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
