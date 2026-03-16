import { expect, test } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";

test.describe("auth flows", () => {
  test("sign-up creates account and redirects to dashboard with workspace visible", async ({
    page,
  }) => {
    const { name } = await signUpAndLogin(page);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Active workspace")).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("sign-in with existing credentials reaches dashboard", async ({
    page,
  }) => {
    // First sign up to create an account
    const { email, password } = await signUpAndLogin(page);

    // Sign out by clearing cookies and navigating to sign-in
    await page.context().clearCookies();
    await page.goto("/sign-in");

    // Sign in with the same credentials
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByText("Active workspace")).toBeVisible();
  });

  test("sign-in with wrong password shows error", async ({ page }) => {
    // First sign up to create an account
    const { email } = await signUpAndLogin(page);

    // Sign out and go to sign-in
    await page.context().clearCookies();
    await page.goto("/sign-in");

    // Try to sign in with wrong password
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrongpassword123");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Sonner toast should show an error
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("[data-sonner-toast]")).toContainText(/invalid|incorrect|wrong|error/i);
  });

  test("unauthenticated user visiting /dashboard is redirected to sign-in", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15000 });
  });
});
