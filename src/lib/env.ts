import { z } from "zod";

// Vercel provides these system env vars (without protocol) for deploys
const vercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;
const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;
const vercelBranchUrl = process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : undefined;

// Derive AUTH_DATABASE_URL from DATABASE_URL by appending search_path=auth.
// Uses DATABASE_URL_UNPOOLED (if available) because Neon's pooler doesn't
// support search_path in startup options.
function deriveAuthDatabaseUrl(): string | undefined {
  if (process.env.AUTH_DATABASE_URL) return process.env.AUTH_DATABASE_URL;
  // Prefer unpooled for Neon compatibility with search_path option
  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!dbUrl) return undefined;
  const separator = dbUrl.includes("?") ? "&" : "?";
  return `${dbUrl}${separator}options=-c%20search_path%3Dauth`;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  AUTH_DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  VERCEL_URL: z.url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.url().optional(),
  VERCEL_BRANCH_URL: z.url().optional(),
  PLAYWRIGHT_BASE_URL: z.url().optional(),
  DOPPLER_PROJECT: z.string().min(1).optional(),
  DOPPLER_CONFIG: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL ?? vercelProductionUrl ?? vercelUrl,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_DATABASE_URL: deriveAuthDatabaseUrl(),
  AUTH_SECRET: process.env.AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? vercelProductionUrl ?? vercelUrl,
  VERCEL_URL: vercelUrl,
  VERCEL_PROJECT_PRODUCTION_URL: vercelProductionUrl,
  VERCEL_BRANCH_URL: vercelBranchUrl,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
  DOPPLER_PROJECT: process.env.DOPPLER_PROJECT,
  DOPPLER_CONFIG: process.env.DOPPLER_CONFIG,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ")}`,
  );
}

export const env = parsed.data;
