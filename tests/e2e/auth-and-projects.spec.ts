import { expect, test } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";

test("user can sign up and manage projects", async ({ page }) => {
  await signUpAndLogin(page);

  const projectName = `Launch plan ${Date.now()}`;
  await page.getByLabel("Name").fill(projectName);
  await page.getByLabel("Description").fill("Initial project created by Playwright.");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(projectName)).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("PAUSED")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(projectName)).not.toBeVisible();
});
