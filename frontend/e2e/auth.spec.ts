import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";

test("signup, view dashboard, log out, and log back in", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/signup");
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Welcome back, Jane Doe.")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Welcome back, Jane Doe.")).toBeVisible();
});

test("protected route redirects to login when logged out, and login redirects away when already authenticated", async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/signup");
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
});
