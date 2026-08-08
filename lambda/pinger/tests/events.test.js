const { mockClient } = require('aws-sdk-client-mock');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { publishStatusChanges } = require('../lib/events');

function eventBridgeMock() {
  return mockClient(EventBridgeClient);
}

function change(overrides = {}) {
  return {
    site: { site_id: 's1', user_id: 'u1', url: 'https://a.com', name: 'Site A', last_status_change_at: null },
    result: { status_code: null, latency_ms: null, error_type: 'timeout', error_message: 'timed out' },
    transition: { statusChanged: true, previousStatus: null, status: 'down' },
    checkedAt: '2026-08-02T14:05:03.123Z',
    ...overrides,
  };
}

describe('publishStatusChanges', () => {
  it('does nothing when there are no changes', async () => {
    const eb = eventBridgeMock();

    await publishStatusChanges(eb, { busName: 'pulsemonitor-dev-site-events', changes: [] });

    expect(eb.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it('does nothing when busName is not set', async () => {
    const eb = eventBridgeMock();

    await publishStatusChanges(eb, { busName: undefined, changes: [change()] });

    expect(eb.commandCalls(PutEventsCommand)).toHaveLength(0);
  });

  it('publishes one entry per change with the correct envelope', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [{ EventId: '1' }] });

    await publishStatusChanges(eb, { busName: 'pulsemonitor-dev-site-events', changes: [change()] });

    const call = eb.commandCalls(PutEventsCommand)[0].args[0].input;
    expect(call.Entries).toHaveLength(1);
    const entry = call.Entries[0];
    expect(entry.Source).toBe('pulsemonitor.pinger');
    expect(entry.DetailType).toBe('SiteStatusChanged');
    expect(entry.EventBusName).toBe('pulsemonitor-dev-site-events');

    const detail = JSON.parse(entry.Detail);
    expect(detail.site_id).toBe('s1');
    expect(detail.user_id).toBe('u1');
    expect(detail.url).toBe('https://a.com');
    expect(detail.status).toBe('down');
    expect(detail.checked_at).toBe('2026-08-02T14:05:03.123Z');
  });

  it('emits previous_status: null (present, not omitted) on a first check', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    await publishStatusChanges(eb, {
      busName: 'pulsemonitor-dev-site-events',
      changes: [change({ transition: { statusChanged: true, previousStatus: null, status: 'down' } })],
    });

    const detail = JSON.parse(eb.commandCalls(PutEventsCommand)[0].args[0].input.Entries[0].Detail);
    expect('previous_status' in detail).toBe(true);
    expect(detail.previous_status).toBeNull();
  });

  it('emits the prior status string on a subsequent transition', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    await publishStatusChanges(eb, {
      busName: 'pulsemonitor-dev-site-events',
      changes: [change({ transition: { statusChanged: true, previousStatus: 'down', status: 'up' } })],
    });

    const detail = JSON.parse(eb.commandCalls(PutEventsCommand)[0].args[0].input.Entries[0].Detail);
    expect(detail.previous_status).toBe('down');
    expect(detail.status).toBe('up');
  });

  it('batches into groups of at most 10 (23 changes -> 3 calls of 10/10/3)', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    const changes = Array.from({ length: 23 }, (_, i) =>
      change({ site: { site_id: `s${i}`, user_id: 'u1', url: 'https://a.com', name: 'Site A', last_status_change_at: null } }),
    );

    await publishStatusChanges(eb, { busName: 'pulsemonitor-dev-site-events', changes });

    const calls = eb.commandCalls(PutEventsCommand);
    expect(calls).toHaveLength(3);
    expect(calls[0].args[0].input.Entries).toHaveLength(10);
    expect(calls[1].args[0].input.Entries).toHaveLength(10);
    expect(calls[2].args[0].input.Entries).toHaveLength(3);
  });

  it('does not throw when the response reports FailedEntryCount > 0', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).resolves({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalFailure', ErrorMessage: 'boom' }],
    });

    await expect(
      publishStatusChanges(eb, { busName: 'pulsemonitor-dev-site-events', changes: [change()] }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when the client rejects', async () => {
    const eb = eventBridgeMock();
    eb.on(PutEventsCommand).rejects(new Error('network blip'));

    await expect(
      publishStatusChanges(eb, { busName: 'pulsemonitor-dev-site-events', changes: [change()] }),
    ).resolves.toBeUndefined();
  });
});
