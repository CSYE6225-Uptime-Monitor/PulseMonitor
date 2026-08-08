const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Reserved words in DynamoDB - url, status, and name all require
// ExpressionAttributeNames whenever they're referenced. checked_at is not
// reserved and needs no alias.
const PROJECTION =
  '#url, #name, #status, user_id, site_id, enabled, check_frequency_minutes, consecutive_failures, checked_at, last_status_change_at';
const SCAN_EXPRESSION_NAMES = { '#url': 'url', '#name': 'name', '#status': 'status' };

const DEFAULT_FREQUENCY_MINUTES = 5;
// Compensates for EventBridge rate() jitter and runPool spreading checked_at
// across an invocation - both scheduler properties, not site properties, so
// this is a flat offset rather than a percentage of the frequency. Without
// it, a site checked just under one tick ago gets skipped and waits a full
// extra tick, silently halving its effective check rate.
// INVARIANT: must stay well below the EventBridge tick interval (5 minutes),
// or every site becomes due every tick and this predicate is a no-op.
const DUE_TOLERANCE_MS = 30_000;

// Pure and injectable-`now` so every case is a plain equality assertion -
// jest.useFakeTimers() would leak across tests and fight the AbortSignal
// timers pingUrl uses.
function isSiteDue(site, nowMs) {
  if (!site.checked_at) return true;

  const checkedAtMs = Date.parse(site.checked_at);
  if (Number.isNaN(checkedAtMs)) return true;

  const freqMinutes = Number(site.check_frequency_minutes) || DEFAULT_FREQUENCY_MINUTES;
  return nowMs - checkedAtMs >= freqMinutes * 60_000 - DUE_TOLERANCE_MS;
}

async function scanDueSites(docClient, tableName, { now = Date.now() } = {}) {
  const sites = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: PROJECTION,
        ExpressionAttributeNames: SCAN_EXPRESSION_NAMES,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    sites.push(...(page.Items || []));
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return sites.filter((site) => site.enabled !== false && isSiteDue(site, now));
}

// Writes the ping result back onto the site item. ConditionExpression means a
// check racing a DELETE /v1/sites/:id fails with ConditionalCheckFailedException
// instead of resurrecting a deleted row - callers should swallow that error.
async function writeSiteStatus(docClient, tableName, { userId, siteId, previousStatus, result, checkedAt }) {
  const statusChanged = previousStatus === undefined || previousStatus !== result.status;

  const updateExpression = [
    'SET #status = :status',
    'status_code = :status_code',
    'latency_ms = :latency_ms',
    'checked_at = :checked_at',
    'error_type = :error_type',
    'error_message = :error_message',
  ];
  const values = {
    ':status': result.status,
    ':status_code': result.status_code,
    ':latency_ms': result.latency_ms,
    ':checked_at': checkedAt,
    ':error_type': result.error_type,
    ':error_message': result.error_message,
  };

  if (result.status === 'up') {
    updateExpression.push('consecutive_failures = :consecutive_failures');
    values[':consecutive_failures'] = 0;
  } else if (statusChanged) {
    // First failure after being up (or never checked) - start the streak at 1.
    updateExpression.push('consecutive_failures = :consecutive_failures');
    values[':consecutive_failures'] = 1;
  } else {
    // Still down - increment atomically rather than trusting the scanned
    // count, which may be stale by the time this UpdateItem runs.
    updateExpression.push('consecutive_failures = if_not_exists(consecutive_failures, :zero) + :one');
    values[':zero'] = 0;
    values[':one'] = 1;
  }

  if (statusChanged) {
    updateExpression.push('last_status_change_at = :checked_at');
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { user_id: userId, site_id: siteId },
      UpdateExpression: updateExpression.join(', '),
      ConditionExpression: 'attribute_exists(site_id)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: values,
    }),
  );

  return {
    statusChanged,
    previousStatus: previousStatus ?? null,
    status: result.status,
  };
}

module.exports = { scanDueSites, writeSiteStatus, isSiteDue };
