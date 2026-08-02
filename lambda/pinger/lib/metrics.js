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

module.exports = { emitSiteDownMetric };
