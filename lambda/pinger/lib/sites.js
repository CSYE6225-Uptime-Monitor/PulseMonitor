const { ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Reserved words in DynamoDB - url, status, and name all require
// ExpressionAttributeNames whenever they're referenced.
const PROJECTION = '#url, #name, user_id, site_id, enabled, check_frequency_minutes, consecutive_failures';
const SCAN_EXPRESSION_NAMES = { '#url': 'url', '#name': 'name' };

async function scanEnabledSites(docClient, tableName) {
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

  return sites.filter((site) => site.enabled !== false);
}

// Writes the ping result back onto the site item. ConditionExpression means a
// check racing a DELETE /v1/sites/:id fails with ConditionalCheckFailedException
// instead of resurrecting a deleted row - callers should swallow that error.
async function writeSiteStatus(docClient, tableName, { userId, siteId, previousStatus, result, checkedAt }) {
  const statusChanged = previousStatus === undefined || previousStatus !== result.status;
  const consecutiveFailures = result.status === 'up' ? 0 : 1;

  const updateExpression = [
    'SET #status = :status',
    'status_code = :status_code',
    'latency_ms = :latency_ms',
    'checked_at = :checked_at',
    'error_type = :error_type',
    'error_message = :error_message',
    'consecutive_failures = :consecutive_failures',
  ];
  const values = {
    ':status': result.status,
    ':status_code': result.status_code,
    ':latency_ms': result.latency_ms,
    ':checked_at': checkedAt,
    ':error_type': result.error_type,
    ':error_message': result.error_message,
    ':consecutive_failures': consecutiveFailures,
  };

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
}

module.exports = { scanEnabledSites, writeSiteStatus };
