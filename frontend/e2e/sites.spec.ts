import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";

test("add a site, see it listed, edit it, then delete it", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/signup");
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Add site" }).click();
  await page.getByLabel("URL").fill("https://example.com");
  await page.getByLabel("Name").fill("Example Site");
  await page.getByRole("button", { name: "Add site" }).click();

  await expect(page.getByRole("link", { name: "Example Site" })).toBeVisible();
  await expect(page.getByText("Unknown")).toBeVisible();

  await page.getByRole("link", { name: "Example Site" }).click();
  await expect(page).toHaveURL(/\/sites\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Example Site" })).toBeVisible();
  await expect(page.getByText("No history yet.")).toBeVisible();

  await page.getByLabel("Name").fill("Renamed Site");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Renamed Site" })).toBeVisible();

  await page.getByRole("button", { name: "Delete site" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/no sites yet/i)).toBeVisible();
});

test("shows an inline validation error when the URL is rejected", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/signup");
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Add site" }).click();
  await page.getByLabel("URL").fill("http://127.0.0.1");
  await page.getByLabel("Name").fill("Local");
  await page.getByRole("button", { name: "Add site" }).click();

  await expect(page.getByText(/URL rejected/)).toBeVisible();
});
