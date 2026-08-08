// Emits CloudWatch Embedded Metric Format (EMF) via structured stdout - no
// extra SDK calls, no extra IAM permissions. Emitting this from day one is
// what makes the Sprint-4 CloudWatch alarms a pure-Terraform diff with zero
// Lambda code changes.
function emitSiteDownMetric({ namespace, environment, siteId, isDown }) {
  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [['Environment', 'SiteId'], ['Environment']],
          Metrics: [{ Name: 'SiteDown', Unit: 'Count' }],
        },
      ],
    },
    Environment: environment,
    SiteId: siteId,
    SiteDown: isDown ? 1 : 0,
  };
  console.log(JSON.stringify(emf));
}

// Publishing a status-change event must never throw (see lib/events.js) - a
// throw here would re-run the whole ping cycle via the schedule target's
// retry policy. This metric is the visibility mechanism for that swallowed
// failure instead of a retry.
function emitNotifyPublishFailedMetric({ namespace, environment, count }) {
  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [['Environment']],
          Metrics: [{ Name: 'NotifyPublishFailed', Unit: 'Count' }],
        },
      ],
    },
    Environment: environment,
    NotifyPublishFailed: count,
  };
  console.log(JSON.stringify(emf));
}

module.exports = { emitSiteDownMetric, emitNotifyPublishFailedMetric };
