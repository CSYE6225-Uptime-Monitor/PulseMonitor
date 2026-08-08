import { execFileSync } from "node:child_process";

// Idempotent setup for the e2e harness's DynamoDB tables and S3 buckets, run
// once before the suite against LocalStack (see backend/docker-compose.yml).
// Table/bucket names and schemas must match playwright.config.ts's webServer
// env exactly, or the backend under test 404s/500s on every request.

const ENDPOINT = "http://localhost:4566";
const REGION = "us-east-1";
const HEALTH_URL = `${ENDPOINT}/_localstack/health`;

const AWS_ENV = {
  ...process.env,
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
  AWS_DEFAULT_REGION: REGION,
};

async function waitForLocalStack(attempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return;
    } catch {
      // not up yet - fall through to the retry delay below
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(
    `LocalStack did not become healthy at ${HEALTH_URL} in time. Run "docker compose up" in backend/ first.`
  );
}

// A second `npm run test:e2e` against an already-running LocalStack container
// must not fail just because the table/bucket already exists from last time.
function runIdempotently(args: string[]): void {
  try {
    execFileSync("aws", args, { env: AWS_ENV, stdio: "pipe" });
  } catch (err) {
    const message = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
    if (/ResourceInUseException|BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(message)) {
      return;
    }
    throw err;
  }
}

export default async function globalSetup(): Promise<void> {
  await waitForLocalStack();

  runIdempotently([
    "dynamodb",
    "create-table",
    "--endpoint-url",
    ENDPOINT,
    "--table-name",
    "pulsemonitor-dev-users",
    "--attribute-definitions",
    "AttributeName=email,AttributeType=S",
    "--key-schema",
    "AttributeName=email,KeyType=HASH",
    "--billing-mode",
    "PAY_PER_REQUEST",
  ]);

  runIdempotently([
    "dynamodb",
    "create-table",
    "--endpoint-url",
    ENDPOINT,
    "--table-name",
    "pulsemonitor-dev-sites",
    "--attribute-definitions",
    "AttributeName=user_id,AttributeType=S",
    "AttributeName=site_id,AttributeType=S",
    "--key-schema",
    "AttributeName=user_id,KeyType=HASH",
    "AttributeName=site_id,KeyType=RANGE",
    "--billing-mode",
    "PAY_PER_REQUEST",
  ]);

  runIdempotently(["s3", "mb", "s3://pulsemonitor-dev-monitoring-history-000000000000", "--endpoint-url", ENDPOINT]);
  runIdempotently(["s3", "mb", "s3://pulsemonitor-dev-user-data-000000000000", "--endpoint-url", ENDPOINT]);
  runIdempotently(["s3", "mb", "s3://pulsemonitor-dev-audit-logs-000000000000", "--endpoint-url", ENDPOINT]);
}
