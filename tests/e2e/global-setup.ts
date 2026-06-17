import type { FullConfig } from "@playwright/test";

/**
 * Warms up Next.js Turbopack route compilation before tests run.
 * Without this, the first parallel batch of tests all hit uncompiled routes
 * simultaneously, causing 7+ second response times that can exceed timeouts.
 */
async function globalSetup(config: FullConfig) {
  // The isolated runner (scripts/test-e2e.ts) and CI set PLAYWRIGHT_PROD_SERVER=1:
  // each worker's DB is cloned from a seeded template and `next start` needs no
  // route warmup — skip it entirely.
  if (process.env.PLAYWRIGHT_PROD_SERVER === "1") return;

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3000";

  const routes = [
    "/sign-up",
    "/sign-in",
    "/api/auth/ok",
    "/dashboard",
  ];

  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`);
    } catch {
      // Server might redirect or return errors — we only care about triggering compilation
    }
  }
}

export default globalSetup;
