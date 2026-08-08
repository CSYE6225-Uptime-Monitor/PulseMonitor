const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');

const { pingUrl } = require('./lib/ping');
const { scanDueSites, writeSiteStatus } = require('./lib/sites');
const { writeHistoryRecord } = require('./lib/history');
const { emitSiteDownMetric } = require('./lib/metrics');
const { publishStatusChanges } = require('./lib/events');

function readEnv() {
  const required = ['SITES_TABLE', 'HISTORY_BUCKET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    sitesTable: process.env.SITES_TABLE,
    historyBucket: process.env.HISTORY_BUCKET,
    historyPrefix: process.env.HISTORY_PREFIX || 'sites',
    pingTimeoutMs: Number(process.env.PING_TIMEOUT_MS) || 10000,
    maxConcurrency: Number(process.env.MAX_CONCURRENCY) || 20,
    metricNamespace: process.env.METRIC_NAMESPACE || 'PulseMonitor',
    environment: process.env.ENVIRONMENT || 'dev',
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
    s3Endpoint: process.env.S3_ENDPOINT,
    // Optional and deliberately not in `required`: absent means
    // notifications are disabled, and publishStatusChanges() is a no-op
    // without a bus name.
    eventBusName: process.env.EVENT_BUS_NAME,
    eventBridgeEndpoint: process.env.EVENTBRIDGE_ENDPOINT,
  };
}

function makeClients(config) {
  const dynamo = new DynamoDBClient({
    ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
  });
  const docClient = DynamoDBDocumentClient.from(dynamo);
  const s3Client = new S3Client({
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
  });
  const eventBridgeClient = new EventBridgeClient({
    ...(config.eventBridgeEndpoint ? { endpoint: config.eventBridgeEndpoint } : {}),
  });
  return { docClient, s3Client, eventBridgeClient };
}

// Runs `worker` over `items` with at most `concurrency` in flight at once,
// stopping early if `shouldStop()` returns true between dispatches.
async function runPool(items, concurrency, worker, shouldStop) {
  let cursor = 0;
  const results = [];

  async function next() {
    while (cursor < items.length) {
      if (shouldStop()) return;
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function checkSite(site, { docClient, s3Client, config }) {
  const checkedAt = new Date().toISOString();
  const result = await pingUrl(site.url, { timeoutMs: config.pingTimeoutMs });

  let transition;
  try {
    transition = await writeSiteStatus(docClient, config.sitesTable, {
      userId: site.user_id,
      siteId: site.site_id,
      previousStatus: site.status,
      result,
      checkedAt,
    });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Site was deleted between the scan and this update - drop it silently.
      return { siteId: site.site_id, skipped: true };
    }
    throw err;
  }

  await writeHistoryRecord(s3Client, {
    bucket: config.historyBucket,
    prefix: config.historyPrefix,
    record: {
      user_id: site.user_id,
      site_id: site.site_id,
      url: site.url,
      checked_at: checkedAt,
      status: result.status,
      status_code: result.status_code,
      latency_ms: result.latency_ms,
      error_type: result.error_type,
      error_message: result.error_message,
      region: process.env.AWS_REGION || 'us-east-1',
    },
  });

  emitSiteDownMetric({
    namespace: config.metricNamespace,
    environment: config.environment,
    siteId: site.site_id,
    isDown: result.status === 'down',
  });

  return {
    siteId: site.site_id,
    status: result.status,
    // Only carried on a real transition - collected into the publish batch
    // by handler() and stripped from the public results array below.
    change: transition?.statusChanged ? { site, result, transition, checkedAt } : undefined,
  };
}

async function handler(event, context) {
  const config = readEnv();
  const { docClient, s3Client, eventBridgeClient } = makeClients(config);

  const sites = await scanDueSites(docClient, config.sitesTable);

  const shouldStop = () =>
    typeof context?.getRemainingTimeInMillis === 'function' && context.getRemainingTimeInMillis() < 15000;

  const results = await runPool(sites, config.maxConcurrency, (site) => checkSite(site, { docClient, s3Client, config }), shouldStop);

  const changes = results.filter((r) => r?.change).map((r) => r.change);

  // publishStatusChanges() is designed to never throw, but a throw here must
  // never fail the ping cycle regardless - DynamoDB and S3 are already
  // written by this point, so the only thing at risk is the notification.
  try {
    await publishStatusChanges(eventBridgeClient, {
      busName: config.eventBusName,
      changes,
      metricNamespace: config.metricNamespace,
      environment: config.environment,
    });
  } catch (err) {
    // Swallowed deliberately - see comment above.
  }

  return {
    checked: results.filter(Boolean).length,
    total: sites.length,
    results: results.map((r) => (r ? { siteId: r.siteId, ...(r.skipped ? { skipped: true } : { status: r.status }) } : r)),
  };
}

module.exports = { handler };
