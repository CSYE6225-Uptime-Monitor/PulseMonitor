import path from "path";
import { defineConfig, devices } from "@playwright/test";

// Requires LocalStack running (see backend/docker-compose.yml) providing both
// DynamoDB and S3 on port 4566. globalSetup creates the tables/buckets
// idempotently, so no manual setup step is required beyond `docker compose up`.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve("./e2e/global-setup"),
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
        DYNAMODB_ENDPOINT: "http://localhost:4566",
        HISTORY_BUCKET: "pulsemonitor-dev-monitoring-history-000000000000",
        HISTORY_PREFIX: "sites",
        USER_DATA_BUCKET: "pulsemonitor-dev-user-data-000000000000",
        AUDIT_BUCKET: "pulsemonitor-dev-audit-logs-000000000000",
        EXPORT_PREFIX: "exports",
        AUDIT_PREFIX: "audit",
        S3_ENDPOINT: "http://localhost:4566",
        AWS_ACCESS_KEY_ID: "test",
        AWS_SECRET_ACCESS_KEY: "test",
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
