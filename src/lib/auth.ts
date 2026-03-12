import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { provisionWorkspaceForUser } from "@/lib/provisioning";

const globalForAuth = globalThis as {
  authPool?: Pool;
};

const authPool =
  globalForAuth.authPool ??
  new Pool({
    connectionString: env.AUTH_DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForAuth.authPool = authPool;
}

export const auth = betterAuth({
  appName: "SaaS Template",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.AUTH_SECRET,
  database: authPool,
  trustedOrigins: [
    env.APP_URL,
    env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  experimental: {
    joins: true,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/sign-up")) {
        return;
      }

      const nextSession = ctx.context.newSession;

      if (!nextSession) {
        return;
      }

      await provisionWorkspaceForUser({
        id: nextSession.user.id,
        email: nextSession.user.email,
        name: nextSession.user.name,
      });
    }),
  },
  plugins: [nextCookies()],
});
