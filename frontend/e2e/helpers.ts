import type { Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { expect } from "@playwright/test";

// Extracted here because account.spec.ts is the third spec repeating this
// exact block - auth.spec.ts and sites.spec.ts keep their own inline copies
// rather than being refactored to use this, so a change to one doesn't risk
// breaking the others' already-passing assertions.
export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/signup");
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Last name").fill("Doe");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  return email;
}
