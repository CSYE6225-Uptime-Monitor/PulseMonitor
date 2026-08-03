import path from "path";
import { defineConfig, devices } from "@playwright/test";

// Requires DynamoDB Local running (see backend/docker-compose.yml) with the
// pulsemonitor-dev-users table created before running these tests.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: [
    {
      command: "node server.js",
      cwd: path.join(__dirname, "../backend"),
      url: "http://localhost:8080/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        PORT: "8080",
        NODE_ENV: "test",
        SESSION_SECRET: "e2e-test-secret-not-for-production",
        USERS_TABLE: "pulsemonitor-dev-users",
        SITES_TABLE: "pulsemonitor-dev-sites",
        AWS_REGION: "us-east-1",
        DYNAMODB_ENDPOINT: "http://localhost:8000",
        HISTORY_BUCKET: "pulsemonitor-dev-monitoring-history-000000000000",
        HISTORY_PREFIX: "sites",
        S3_ENDPOINT: "http://localhost:8000",
        AWS_ACCESS_KEY_ID: "local",
        AWS_SECRET_ACCESS_KEY: "local",
      },
    },
    {
      command: "npm run dev",
      cwd: __dirname,
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        BACKEND_URL: "http://localhost:8080",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
