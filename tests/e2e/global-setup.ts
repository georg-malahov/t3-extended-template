import type { FullConfig } from "@playwright/test";

/**
 * Warms up Next.js Turbopack route compilation before tests run.
 * Without this, the first parallel batch of tests all hit uncompiled routes
 * simultaneously, causing 7+ second response times that can exceed timeouts.
 */
async function globalSetup(config: FullConfig) {
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
