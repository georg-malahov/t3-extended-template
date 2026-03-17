import { expect, test } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";

test.describe("project CRUD", () => {
  test("create project with name and description, verify it appears in the data table", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    const projectName = `Project ${Date.now()}`;
    const projectDesc = "A detailed project description for testing.";

    await page.getByLabel("Name").fill(projectName);
    await page.getByLabel("Description").fill(projectDesc);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(projectDesc)).toBeVisible();
    await expect(page.getByRole("cell", { name: "ACTIVE" })).toBeVisible();
  });

  test("create project with name only (no description), verify 'No description' shown", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    const projectName = `NoDesc ${Date.now()}`;

    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("No description")).toBeVisible();
  });

  test("toggle project status ACTIVE -> PAUSED -> ACTIVE, verify status badge updates", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    const projectName = `Toggle ${Date.now()}`;

    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("cell", { name: "ACTIVE" })).toBeVisible();

    // ACTIVE -> PAUSED
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("cell", { name: "PAUSED" })).toBeVisible({ timeout: 10000 });

    // PAUSED -> ACTIVE
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByRole("cell", { name: "ACTIVE" })).toBeVisible({ timeout: 10000 });
  });

  test("delete project and verify it is removed from the table", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    const projectName = `ToDelete ${Date.now()}`;

    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText(projectName)).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Create your first project.")).toBeVisible();
  });

  test("create multiple projects and verify they all appear in the table ordered by newest first", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    const ts = Date.now();
    const project1 = `First ${ts}`;
    const project2 = `Second ${ts + 1}`;
    const project3 = `Third ${ts + 2}`;

    // Create projects in order
    for (const name of [project1, project2, project3]) {
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
    }

    // All three should be visible
    await expect(page.getByText(project1)).toBeVisible();
    await expect(page.getByText(project2)).toBeVisible();
    await expect(page.getByText(project3)).toBeVisible();

    // Verify order: newest first means project3 row appears before project1 row
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBe(3);

    const firstRowText = await rows.nth(0).textContent();
    const lastRowText = await rows.nth(2).textContent();
    expect(firstRowText).toContain(project3);
    expect(lastRowText).toContain(project1);
  });

  test("submitting create form with empty name shows validation error", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    // Leave name empty, click Create
    await page.getByRole("button", { name: "Create" }).click();

    // Validation error should appear under the Name field
    await expect(page.getByText(/>=2 characters/i)).toBeVisible({ timeout: 5000 });

    // No project should be created - empty state should still show
    await expect(page.getByText("Create your first project.")).toBeVisible();
  });

  test("submitting create form with 1-character name shows validation error", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    await page.getByLabel("Name").fill("A");
    await page.getByRole("button", { name: "Create" }).click();

    // Validation error should appear for min 2 chars
    await expect(page.getByText(/>=2 characters/i)).toBeVisible({ timeout: 5000 });
  });

  test("create button shows 'Creating...' loading state during submission", async ({
    page,
  }) => {
    await signUpAndLogin(page);

    // Intercept the API request and delay the response
    await page.route("**/api/model/**", async (route) => {
      // Only delay POST requests (create)
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.continue();
    });

    const projectName = `Loading ${Date.now()}`;
    await page.getByLabel("Name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();

    // Button should show loading state
    await expect(page.getByRole("button", { name: "Creating..." })).toBeVisible({ timeout: 5000 });

    // Eventually it should revert back to "Create"
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible({ timeout: 15000 });

    // Verify the project was actually created after the delayed request completed
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
  });
});
