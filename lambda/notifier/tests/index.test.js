jest.mock('../lib/owner');
jest.mock('../lib/render');
jest.mock('../lib/email');
jest.mock('../lib/metrics');

const { resolveOwnerEmail } = require('../lib/owner');
const { renderDownEmail, renderRecoveredEmail } = require('../lib/render');
const { sendEmail, isPermanentRejection } = require('../lib/email');
const { emitNotificationFailedMetric } = require('../lib/metrics');
const { handler } = require('../index');

function downEvent(overrides = {}) {
  return {
    detail: {
      site_id: 's1',
      user_id: 'u1',
      url: 'https://example.com',
      name: 'Example Site',
      status: 'down',
      previous_status: 'up',
      previous_status_change_at: null,
      status_code: null,
      latency_ms: null,
      error_type: 'timeout',
      error_message: 'timed out',
      checked_at: '2026-08-02T14:05:00.000Z',
      ...overrides,
    },
  };
}

function recoveredEvent(overrides = {}) {
  return {
    detail: {
      site_id: 's1',
      user_id: 'u1',
      url: 'https://example.com',
      name: 'Example Site',
      status: 'up',
      previous_status: 'down',
      previous_status_change_at: '2026-08-02T13:51:00.000Z',
      status_code: 200,
      latency_ms: 100,
      error_type: null,
      error_message: null,
      checked_at: '2026-08-02T14:05:00.000Z',
      ...overrides,
    },
  };
}

describe('handler', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      USERS_TABLE: 'pulsemonitor-dev-users',
      FROM_ADDRESS: 'alerts@pulsemonitor.online',
    };
    delete process.env.NOTIFY_OVERRIDE_RECIPIENT;
    jest.clearAllMocks();
    resolveOwnerEmail.mockResolvedValue('owner@example.com');
    renderDownEmail.mockReturnValue({ subject: 'DOWN subject', text: 'down text', html: '<p>down</p>' });
    renderRecoveredEmail.mockReturnValue({ subject: 'RECOVERED subject', text: 'recovered text', html: '<p>up</p>' });
    sendEmail.mockResolvedValue(undefined);
    isPermanentRejection.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('throws when a required environment variable is missing', async () => {
    delete process.env.USERS_TABLE;
    await expect(handler(downEvent())).rejects.toThrow(/USERS_TABLE/);
  });

  it('sends the down-template email for a down event', async () => {
    const outcome = await handler(downEvent());

    expect(renderDownEmail).toHaveBeenCalledTimes(1);
    expect(renderRecoveredEmail).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0][1];
    expect(call.to).toBe('owner@example.com');
    expect(call.subject).toBe('DOWN subject');
    expect(outcome).toEqual({ sent: true, site_id: 's1' });
  });

  it('sends the recovery-template email for a recovery event', async () => {
    await handler(recoveredEvent());

    expect(renderRecoveredEmail).toHaveBeenCalledTimes(1);
    expect(renderDownEmail).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][1].subject).toBe('RECOVERED subject');
  });

  it('sends zero emails and returns skipped when status is up without a previous down', async () => {
    const outcome = await handler(downEvent({ status: 'up', previous_status: null }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ skipped: 'not_a_recovery' });
  });

  it('sends zero emails and does not throw when the owner cannot be resolved', async () => {
    resolveOwnerEmail.mockResolvedValue(null);

    const outcome = await handler(downEvent());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ skipped: 'unknown_owner' });
  });

  it('does not throw and emits a metric on a permanent SES rejection', async () => {
    const err = new Error('Email address is not verified.');
    err.name = 'MessageRejected';
    sendEmail.mockRejectedValue(err);
    isPermanentRejection.mockReturnValue(true);

    const outcome = await handler(downEvent());

    expect(outcome).toEqual({ skipped: 'rejected' });
    expect(emitNotificationFailedMetric).toHaveBeenCalledTimes(1);
  });

  it('throws on a transient SES error so the platform retries', async () => {
    const err = new Error('rate exceeded');
    err.name = 'TooManyRequestsException';
    sendEmail.mockRejectedValue(err);
    isPermanentRejection.mockReturnValue(false);

    await expect(handler(downEvent())).rejects.toThrow('rate exceeded');
  });

  it('redirects to the override recipient while still resolving the real owner', async () => {
    process.env.NOTIFY_OVERRIDE_RECIPIENT = 'test-inbox@example.com';

    await handler(downEvent());

    expect(resolveOwnerEmail).toHaveBeenCalledTimes(1);
    const call = sendEmail.mock.calls[0][1];
    expect(call.to).toBe('test-inbox@example.com');
    expect(call.subject).toContain('owner@example.com');
  });
});
