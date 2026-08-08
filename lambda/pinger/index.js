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

// Fisher-Yates. scanDueSites returns a stable table-scan order, so without
// shuffling, a shouldStop time-budget cutoff always strands the same tail of
// sites - they never advance checked_at, stay "due", and get scanned (and
// stranded) again next tick while the same head sites keep winning.
function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Runs `worker` over `items` with at most `concurrency` in flight at once,
// stopping early if `shouldStop()` returns true between dispatches. A single
// item throwing (e.g. a throttled DynamoDB write or an S3 error) is captured
// per-item instead of rejecting the whole pool - otherwise Promise.all
// rejects, handler() throws, and EventBridge retries the entire batch,
// duplicating history records for every site that already succeeded.
async function runPool(items, concurrency, worker, shouldStop) {
  let cursor = 0;
  const results = [];
  let stoppedEarly = false;

  async function next() {
    while (cursor < items.length) {
      if (shouldStop()) {
        stoppedEarly = true;
        return;
      }
      const index = cursor++;
      try {
        results[index] = await worker(items[index]);
      } catch (err) {
        results[index] = { siteId: items[index].site_id, failed: true, error: err.message };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return { results, stoppedEarly };
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

  const dueSites = await scanDueSites(docClient, config.sitesTable);
  const sites = shuffle(dueSites);

  const shouldStop = () =>
    typeof context?.getRemainingTimeInMillis === 'function' && context.getRemainingTimeInMillis() < 15000;

  const { results, stoppedEarly } = await runPool(
    sites,
    config.maxConcurrency,
    (site) => checkSite(site, { docClient, s3Client, config }),
    shouldStop
  );

  if (stoppedEarly) {
    // Previously silent - a tick that ran out of time budget left sites
    // unchecked with no signal anywhere that it had happened.
    const checkedCount = results.filter(Boolean).length;
    console.warn(`Ping cycle stopped early: ${checkedCount}/${sites.length} sites checked before the time budget ran out.`);
  }

  const changes = results.filter((r) => r?.change).map((r) => r.change);

  const failures = results.filter((r) => r?.failed);
  for (const failure of failures) {
    // Made visible now that it no longer aborts the tick - see runPool.
    console.error(`Failed to check site ${failure.siteId}: ${failure.error}`);
  }

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
    checked: results.filter((r) => r && !r.failed).length,
    failed: failures.length,
    total: sites.length,
    results: results.map((r) => {
      if (!r) return r;
      if (r.failed) return { siteId: r.siteId, failed: true };
      if (r.skipped) return { siteId: r.siteId, skipped: true };
      return { siteId: r.siteId, status: r.status };
    }),
  };
}

module.exports = { handler };
