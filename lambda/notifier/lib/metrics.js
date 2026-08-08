// Stdout EMF, no extra SDK call, no extra IAM - same pattern as
// lambda/pinger/lib/metrics.js. This is what makes a MessageRejected
// visible outside a single log line, without requiring an SES configuration
// set to already answer "did notifications actually go out".
function emitNotificationFailedMetric({ namespace, environment, reason }) {
  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [['Environment', 'Reason']],
          Metrics: [{ Name: 'NotificationFailed', Unit: 'Count' }],
        },
      ],
    },
    Environment: environment,
    Reason: reason,
    NotificationFailed: 1,
  };
  console.log(JSON.stringify(emf));
}

module.exports = { emitNotificationFailedMetric };
