const { SendEmailCommand } = require('@aws-sdk/client-sesv2');

async function sendEmail(sesClient, { from, to, configurationSetName, subject, text, html }) {
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ConfigurationSetName: configurationSetName,
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: text },
            Html: { Data: html },
          },
        },
      },
    }),
  );
}

// Permanent failures (retrying is guaranteed to fail identically - typically
// an unverified recipient in the SES sandbox, or the account/sending being
// suspended) vs transient ones (TooManyRequestsException/ThrottlingException,
// which the caller should let the platform retry). Defaults to "not
// permanent" for anything unrecognized: failing safe toward a retry is
// better than silently dropping a notification we don't understand yet.
const PERMANENT_ERROR_NAMES = new Set(['MessageRejected', 'AccountSuspendedException', 'SendingPausedException']);

function isPermanentRejection(err) {
  if (PERMANENT_ERROR_NAMES.has(err.name)) return true;
  return /not verified/i.test(err.message || '');
}

module.exports = { sendEmail, isPermanentRejection };
