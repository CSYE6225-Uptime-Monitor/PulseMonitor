const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { scanEnabledSites, writeSiteStatus } = require('../lib/sites');

function docClientMock() {
  return mockClient(DynamoDBDocumentClient);
}

describe('scanEnabledSites', () => {
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

    const sites = await scanEnabledSites(ddb, 'pulsemonitor-dev-sites');
    expect(sites.map((s) => s.site_id)).toEqual(['s1', 's3']);
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
