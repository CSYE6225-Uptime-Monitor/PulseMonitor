const { mockClient } = require('aws-sdk-client-mock');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { sendEmail, isPermanentRejection } = require('../lib/email');

function sesMock() {
  return mockClient(SESv2Client);
}

describe('sendEmail', () => {
  it('builds a SendEmailCommand with the from address, recipient, subject, and both bodies', async () => {
    const ses = sesMock();
    ses.on(SendEmailCommand).resolves({ MessageId: 'abc' });

    await sendEmail(ses, {
      from: 'alerts@pulsemonitor.online',
      to: 'owner@example.com',
      configurationSetName: 'pulsemonitor-dev-notifications',
      subject: '[PulseMonitor] DOWN: Example',
      text: 'plain text body',
      html: '<p>html body</p>',
    });

    const call = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(call.FromEmailAddress).toBe('alerts@pulsemonitor.online');
    expect(call.Destination.ToAddresses).toEqual(['owner@example.com']);
    expect(call.ConfigurationSetName).toBe('pulsemonitor-dev-notifications');
    expect(call.Content.Simple.Subject.Data).toBe('[PulseMonitor] DOWN: Example');
    expect(call.Content.Simple.Body.Text.Data).toBe('plain text body');
    expect(call.Content.Simple.Body.Html.Data).toBe('<p>html body</p>');
  });
});

describe('isPermanentRejection', () => {
  it('is true for MessageRejected', () => {
    const err = new Error('Email address is not verified.');
    err.name = 'MessageRejected';
    expect(isPermanentRejection(err)).toBe(true);
  });

  it('is true for AccountSuspendedException', () => {
    const err = new Error('suspended');
    err.name = 'AccountSuspendedException';
    expect(isPermanentRejection(err)).toBe(true);
  });

  it('is true for SendingPausedException', () => {
    const err = new Error('paused');
    err.name = 'SendingPausedException';
    expect(isPermanentRejection(err)).toBe(true);
  });

  it('is true when the message mentions "not verified" under a generic error name', () => {
    const err = new Error('Email address is not verified in the SES sandbox.');
    err.name = 'ValidationException';
    expect(isPermanentRejection(err)).toBe(true);
  });

  it('is false for TooManyRequestsException (transient, should retry)', () => {
    const err = new Error('rate exceeded');
    err.name = 'TooManyRequestsException';
    expect(isPermanentRejection(err)).toBe(false);
  });

  it('is false for ThrottlingException (transient, should retry)', () => {
    const err = new Error('throttled');
    err.name = 'ThrottlingException';
    expect(isPermanentRejection(err)).toBe(false);
  });

  it('is false for an unrecognized error (fail safe toward retrying, not silently dropping)', () => {
    const err = new Error('something else');
    err.name = 'InternalServerError';
    expect(isPermanentRejection(err)).toBe(false);
  });
});
