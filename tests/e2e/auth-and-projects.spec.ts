import { expect, test } from "@playwright/test";

test("user can sign up and manage projects", async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;

  await page.goto("/sign-up");

  await page.getByLabel("Name").fill("Playwright User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  await expect(page.getByText("Active workspace")).toBeVisible();

  await page.getByLabel("Name").fill("Launch plan");
  await page.getByLabel("Description").fill("Initial project created by Playwright.");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Launch plan")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("PAUSED")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Launch plan")).not.toBeVisible();
});
