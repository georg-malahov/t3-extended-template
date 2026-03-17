import { expect, type Page } from "@playwright/test";

export async function signUpAndLogin(page: Page) {
  const timestamp = Date.now();
  const email = `playwright-${timestamp}@example.com`;
  const name = `Playwright User ${timestamp}`;
  const password = "password123";

  await page.goto("/sign-up");
  // Wait for the form to be fully interactive (handles cold start)
  await page.getByRole("button", { name: "Create account" }).waitFor();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Wait for the button to show loading state, confirming form submission started
  await expect(page.getByRole("button", { name: "Creating account..." })).toBeVisible({ timeout: 5000 });

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await expect(page.getByText("Active workspace")).toBeVisible();

  return { email, name, password };
}
