const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { SESv2Client } = require('@aws-sdk/client-sesv2');

const { resolveOwnerEmail } = require('./lib/owner');
const { renderDownEmail, renderRecoveredEmail } = require('./lib/render');
const { sendEmail, isPermanentRejection } = require('./lib/email');
const { emitNotificationFailedMetric } = require('./lib/metrics');

function readEnv() {
  const required = ['USERS_TABLE', 'FROM_ADDRESS'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    usersTable: process.env.USERS_TABLE,
    usersUserIdIndex: process.env.USERS_USER_ID_INDEX || 'user_id-index',
    fromAddress: process.env.FROM_ADDRESS,
    configurationSetName: process.env.CONFIGURATION_SET_NAME || undefined,
    // Sandbox escape hatch: when set, every notification is redirected to
    // this one verified mailbox with the intended recipient rendered into
    // the subject, so the whole pipeline is demonstrable before SES
    // production access is granted. Terraform forbids this in prod (see
    // infrastructure/modules/monitoring/variables.tf).
    overrideRecipient: process.env.NOTIFY_OVERRIDE_RECIPIENT || undefined,
    metricNamespace: process.env.METRIC_NAMESPACE || 'PulseMonitor',
    environment: process.env.ENVIRONMENT || 'dev',
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
    sesEndpoint: process.env.SES_ENDPOINT,
  };
}

function makeClients(config) {
  const dynamo = new DynamoDBClient({
    ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
  });
  const docClient = DynamoDBDocumentClient.from(dynamo);
  const sesClient = new SESv2Client({
    ...(config.sesEndpoint ? { endpoint: config.sesEndpoint } : {}),
  });
  return { docClient, sesClient };
}

async function handler(event) {
  const config = readEnv();
  const { docClient, sesClient } = makeClients(config);

  const { detail } = event;

  // The recovery rule in notifications.tf already constrains this, but a
  // brand-new site's first successful check is exactly the case that must
  // never generate a "recovered" email - defend in depth rather than trust
  // the EventBridge pattern alone.
  if (detail.status === 'up' && detail.previous_status !== 'down') {
    return { skipped: 'not_a_recovery' };
  }

  const ownerEmail = await resolveOwnerEmail(docClient, config.usersTable, config.usersUserIdIndex, detail.user_id);
  if (!ownerEmail) {
    // Permanent and expected (sparse GSI - see lib/owner.js), not an error.
    console.log(JSON.stringify({ event: 'owner_email_unresolved', site_id: detail.site_id, user_id: detail.user_id }));
    return { skipped: 'unknown_owner' };
  }

  const rendered =
    detail.status === 'down'
      ? renderDownEmail(detail, { environment: config.environment })
      : renderRecoveredEmail(detail, { environment: config.environment });

  const recipient = config.overrideRecipient || ownerEmail;
  const subject = config.overrideRecipient ? `${rendered.subject} [intended: ${ownerEmail}]` : rendered.subject;

  try {
    await sendEmail(sesClient, {
      from: config.fromAddress,
      to: recipient,
      configurationSetName: config.configurationSetName,
      subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch (err) {
    if (isPermanentRejection(err)) {
      emitNotificationFailedMetric({ namespace: config.metricNamespace, environment: config.environment, reason: err.name || 'unknown' });
      console.log(JSON.stringify({ event: 'notification_send_failed_permanent', site_id: detail.site_id, error: err.name }));
      return { skipped: 'rejected' };
    }
    // Transient (throttling, 5xx, timeouts) - let the platform retry via
    // the notifier's event-invoke-config, landing in the DLQ if retries
    // are exhausted.
    throw err;
  }

  return { sent: true, site_id: detail.site_id };
}

module.exports = { handler };
