import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("the activity feed records account creation and login", async ({ page }) => {
  await signUp(page);

  await page.goto("/account");
  await page.getByRole("link", { name: "Account activity" }).click();
  await expect(page).toHaveURL(/\/account\/activity$/);

  await expect(page.getByText("Account created")).toBeVisible();
  await expect(page.getByText("Logged in")).toBeVisible();
  await expect(page.getByText("No account activity yet.")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).not.toBeVisible();
});

test("requesting an export lists it and downloads the file", async ({ page }) => {
  await signUp(page);
  await page.goto("/account");

  await page.getByRole("button", { name: "Request export" }).click();

  const downloadButton = page.getByRole("button", { name: "Download" });
  await expect(downloadButton).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);

  expect(download.suggestedFilename()).toMatch(/^pulsemonitor-export-.*\.json$/);
});

test("the activity page redirects to /login when logged out", async ({ page }) => {
  await page.goto("/account/activity");
  await expect(page).toHaveURL(/\/login$/);
});
