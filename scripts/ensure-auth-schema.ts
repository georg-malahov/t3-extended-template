/**
 * Ensures the "auth" PostgreSQL schema exists before Better Auth migrations run.
 * Required for fresh databases (e.g. first Vercel deploy to a new Neon DB).
 */
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "ERROR: Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
await client.query("CREATE SCHEMA IF NOT EXISTS auth");
await client.end();
console.log('✓ PostgreSQL "auth" schema exists');
