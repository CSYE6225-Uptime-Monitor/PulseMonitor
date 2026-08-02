const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { scanDueSites, writeSiteStatus, isSiteDue } = require('../lib/sites');

function docClientMock() {
  return mockClient(DynamoDBDocumentClient);
}

const NOW = Date.parse('2026-08-02T14:00:00.000Z');

function minutesAgo(minutes) {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function secondsAgo(seconds) {
  return new Date(NOW - seconds * 1000).toISOString();
}

describe('isSiteDue', () => {
  it('is due when checked_at is absent (never checked)', () => {
    expect(isSiteDue({ check_frequency_minutes: 5 }, NOW)).toBe(true);
  });

  it('is due when checked 6 minutes ago with frequency 5', () => {
    expect(isSiteDue({ checked_at: minutesAgo(6), check_frequency_minutes: 5 }, NOW)).toBe(true);
  });

  it('is not due when checked 2 minutes ago with frequency 5', () => {
    expect(isSiteDue({ checked_at: minutesAgo(2), check_frequency_minutes: 5 }, NOW)).toBe(false);
  });

  it('is due when checked 4m50s ago with frequency 5 (inside the 30s tolerance window)', () => {
    expect(isSiteDue({ checked_at: secondsAgo(290), check_frequency_minutes: 5 }, NOW)).toBe(true);
  });

  it('is not due when checked 4m20s ago with frequency 5 (outside the tolerance window)', () => {
    expect(isSiteDue({ checked_at: secondsAgo(260), check_frequency_minutes: 5 }, NOW)).toBe(false);
  });

  it('defaults to 5 minutes when check_frequency_minutes is absent: 6 min ago is due', () => {
    expect(isSiteDue({ checked_at: minutesAgo(6) }, NOW)).toBe(true);
  });

  it('defaults to 5 minutes when check_frequency_minutes is absent: 2 min ago is not due', () => {
    expect(isSiteDue({ checked_at: minutesAgo(2) }, NOW)).toBe(false);
  });

  it('is due when checked 61 minutes ago with frequency 60', () => {
    expect(isSiteDue({ checked_at: minutesAgo(61), check_frequency_minutes: 60 }, NOW)).toBe(true);
  });

  it('is not due when checked 30 minutes ago with frequency 60', () => {
    expect(isSiteDue({ checked_at: minutesAgo(30), check_frequency_minutes: 60 }, NOW)).toBe(false);
  });

  it('is due when checked_at is an unparseable string', () => {
    expect(isSiteDue({ checked_at: 'not-a-date', check_frequency_minutes: 5 }, NOW)).toBe(true);
  });
});

describe('scanDueSites', () => {
  it('requests checked_at in the Scan projection', async () => {
    const ddb = docClientMock();
    ddb.on(ScanCommand).resolves({ Items: [] });

    await scanDueSites(ddb, 'pulsemonitor-dev-sites', { now: NOW });

    const call = ddb.commandCalls(ScanCommand)[0].args[0].input;
    expect(call.ProjectionExpression).toContain('checked_at');
    // checked_at is not a DynamoDB reserved word, unlike url/name/status -
    // it needs no ExpressionAttributeNames entry.
    expect(Object.values(call.ExpressionAttributeNames)).not.toContain('checked_at');
  });

  it('paginates and filters out disabled sites', async () => {
    const ddb = docClientMock();
    ddb
      .on(ScanCommand)
      .resolvesOnce({
        Items: [{ user_id: 'u1', site_id: 's1', url: 'https://a.com', enabled: true }],
        LastEvaluatedKey: { user_id: 'u1', site_id: 's1' },
      })
      .resolvesOnce({
        Items: [
          { user_id: 'u2', site_id: 's2', url: 'https://b.com', enabled: false },
          { user_id: 'u3', site_id: 's3', url: 'https://c.com' },
        ],
      });

    const sites = await scanDueSites(ddb, 'pulsemonitor-dev-sites', { now: NOW });
    expect(sites.map((s) => s.site_id)).toEqual(['s1', 's3']);
  });

  it('excludes a disabled site even when it is overdue', async () => {
    const ddb = docClientMock();
    ddb.on(ScanCommand).resolves({
      Items: [{ user_id: 'u1', site_id: 's1', enabled: false, checked_at: minutesAgo(120), check_frequency_minutes: 5 }],
    });

    const sites = await scanDueSites(ddb, 'pulsemonitor-dev-sites', { now: NOW });
    expect(sites).toEqual([]);
  });

  it('excludes an enabled site that is not yet due', async () => {
    const ddb = docClientMock();
    ddb.on(ScanCommand).resolves({
      Items: [{ user_id: 'u1', site_id: 's1', enabled: true, checked_at: minutesAgo(2), check_frequency_minutes: 5 }],
    });

    const sites = await scanDueSites(ddb, 'pulsemonitor-dev-sites', { now: NOW });
    expect(sites).toEqual([]);
  });

  it('defaults now to Date.now() when not injected', async () => {
    const ddb = docClientMock();
    ddb.on(ScanCommand).resolves({
      Items: [{ user_id: 'u1', site_id: 's1', enabled: true }], // never checked - always due
    });

    const sites = await scanDueSites(ddb, 'pulsemonitor-dev-sites');
    expect(sites.map((s) => s.site_id)).toEqual(['s1']);
  });
});

describe('writeSiteStatus', () => {
  it('conditions on attribute_exists(site_id) and sets last_status_change_at on first check', async () => {
    const ddb = docClientMock();
    ddb.on(UpdateCommand).resolves({});

    await writeSiteStatus(ddb, 'pulsemonitor-dev-sites', {
      userId: 'u1',
      siteId: 's1',
      previousStatus: undefined,
      result: { status: 'up', status_code: 200, latency_ms: 100, error_type: null, error_message: null },
      checkedAt: '2026-08-02T14:05:03.123Z',
    });

    const call = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(call.ConditionExpression).toBe('attribute_exists(site_id)');
    expect(call.UpdateExpression).toContain('last_status_change_at = :checked_at');
    expect(call.ExpressionAttributeValues[':consecutive_failures']).toBe(0);
  });

  it('does not bump last_status_change_at when status has not flipped', async () => {
    const ddb = docClientMock();
    ddb.on(UpdateCommand).resolves({});

    await writeSiteStatus(ddb, 'pulsemonitor-dev-sites', {
      userId: 'u1',
      siteId: 's1',
      previousStatus: 'up',
      result: { status: 'up', status_code: 200, latency_ms: 100, error_type: null, error_message: null },
      checkedAt: '2026-08-02T14:05:03.123Z',
    });

    const call = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(call.UpdateExpression).not.toContain('last_status_change_at');
  });

  it('swallows nothing itself - ConditionalCheckFailedException propagates to the caller', async () => {
    const ddb = docClientMock();
    const err = new Error('conditional check failed');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);

    await expect(
      writeSiteStatus(ddb, 'pulsemonitor-dev-sites', {
        userId: 'u1',
        siteId: 'deleted-site',
        previousStatus: undefined,
        result: { status: 'up', status_code: 200, latency_ms: 100, error_type: null, error_message: null },
        checkedAt: '2026-08-02T14:05:03.123Z',
      }),
    ).rejects.toThrow('conditional check failed');
  });
});
