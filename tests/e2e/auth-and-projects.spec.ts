import { expect, test } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";

test("user can sign up and manage projects", async ({ page }) => {
  await signUpAndLogin(page);

  await page.getByLabel("Name").fill("Launch plan");
  await page.getByLabel("Description").fill("Initial project created by Playwright.");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Launch plan")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("PAUSED")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Launch plan")).not.toBeVisible();
});
