import { expect, type Page } from "@playwright/test";

/**
 * Hydration-robust submit: click the named button and retry until the page
 * leaves `leaveUrl`.
 *
 * Under a production `next start` build, Playwright can click a submit button
 * BEFORE React hydration attaches the form's onSubmit handler — the click then
 * does a no-op native submit and the page never navigates. The dev server hid
 * this (faster hydration). With per-worker isolation we run retries=0, so the
 * helper itself must be hydration-robust: retry the click until navigation
 * actually happens. The auth API is fast, so once the handler is wired a single
 * extra click resolves it.
 */
async function submitUntilLeave(page: Page, buttonName: string, leaveUrl: RegExp) {
  await expect(async () => {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(page).not.toHaveURL(leaveUrl, { timeout: 5000 });
  }).toPass({ timeout: 30000 });
}

/**
 * Hydration-robust sign-in submit: click "Sign in" and wait until the page
 * leaves /sign-in. Use in specs that sign in directly (instead of a raw
 * `getByRole("button", { name: "Sign in" }).click()`), so the click can't land
 * before hydration at retries=0. NOTE: only use this when sign-in SUCCEEDS
 * (the page navigates away). For a failed sign-in (which stays on /sign-in and
 * shows an error), retry on the error toast instead — see auth.spec.ts.
 */
export async function submitSignIn(page: Page) {
  await submitUntilLeave(page, "Sign in", /\/sign-in/);
}

/**
 * Sign up a fresh user and land on the dashboard with the workspace visible.
 * Each call uses a unique email/name so specs are independent (no shared state),
 * which is what makes the suite safe at retries=0.
 */
export async function signUpAndLogin(page: Page) {
  const timestamp = Date.now();
  const email = `playwright-${timestamp}@example.com`;
  const name = `Playwright User ${timestamp}`;
  const password = "password123";

  await page.goto("/sign-up");
  // Wait for the form to be present (handles cold start).
  await page.getByRole("button", { name: "Create account" }).waitFor();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // Hydration-robust: retry the submit until we leave /sign-up. Replaces the old
  // single click + "Creating account..." loading-state assertion, which raced
  // hydration on a prod build.
  await submitUntilLeave(page, "Create account", /\/sign-up/);

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await expect(page.getByText("Active workspace")).toBeVisible();

  return { email, name, password };
}
