const { PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { emitNotifyPublishFailedMetric } = require('./metrics');

// The PutEvents API accepts at most 10 entries per call.
const BATCH_SIZE = 10;

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// previousStatus is normalized to null (not omitted) so recipients always
// see the key: EventBridge content matching does not treat an absent key the
// same as an explicit null, and the down-rule/recovery-rule split in
// infrastructure/modules/monitoring/notifications.tf depends on that
// distinction (see writeSiteStatus in lib/sites.js for why previousStatus is
// undefined on a site's first check).
function toEventEntry(busName, { site, result, transition, checkedAt }) {
  return {
    Source: 'pulsemonitor.pinger',
    DetailType: 'SiteStatusChanged',
    EventBusName: busName,
    Detail: JSON.stringify({
      site_id: site.site_id,
      user_id: site.user_id,
      url: site.url,
      name: site.name,
      status: transition.status,
      previous_status: transition.previousStatus,
      previous_status_change_at: site.last_status_change_at ?? null,
      status_code: result.status_code,
      latency_ms: result.latency_ms,
      error_type: result.error_type,
      error_message: result.error_message,
      checked_at: checkedAt,
    }),
  };
}

// Never throws: a throw here would re-run the pinger's whole schedule tick
// (the EventBridge schedule target retries on Lambda error), duplicating S3
// history writes and consecutive_failures increments for every site, not
// just fixing the one failed publish. DynamoDB is written before this is
// called, so a swallowed failure here is a lost notification, not a lost
// status update - the NotifyPublishFailed metric is the visibility
// mechanism for that, not a retry.
async function publishStatusChanges(client, { busName, changes, metricNamespace = 'PulseMonitor', environment = 'dev' } = {}) {
  if (!busName || !changes || changes.length === 0) return;

  const entries = changes.map((change) => toEventEntry(busName, change));

  for (const batch of chunk(entries, BATCH_SIZE)) {
    try {
      const response = await client.send(new PutEventsCommand({ Entries: batch }));
      if (response.FailedEntryCount > 0) {
        emitNotifyPublishFailedMetric({ namespace: metricNamespace, environment, count: response.FailedEntryCount });
      }
    } catch (err) {
      emitNotifyPublishFailedMetric({ namespace: metricNamespace, environment, count: batch.length });
    }
  }
}

module.exports = { publishStatusChanges };
