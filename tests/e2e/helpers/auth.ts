import { expect, type Page } from "@playwright/test";

export async function signUpAndLogin(page: Page) {
  const timestamp = Date.now();
  const email = `playwright-${timestamp}@example.com`;
  const name = `Playwright User ${timestamp}`;
  const password = "password123";

  await page.goto("/sign-up");

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  await expect(page.getByText("Active workspace")).toBeVisible();

  return { email, name, password };
}
