const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { buildHistoryKey, writeHistoryRecord } = require('../lib/history');

describe('buildHistoryKey', () => {
  it('produces the documented key shape with day partitions and fixed-width epoch_ms', () => {
    const key = buildHistoryKey({
      prefix: 'sites',
      userId: 'user-1',
      siteId: 'site-1',
      checkedAt: '2026-08-02T14:05:03.123Z',
      checkId: 'abcdef12-3456-7890-abcd-ef1234567890',
    });
    expect(key).toBe('sites/user-1/site-1/2026/08/02/1785679503123-abcdef12.json');
  });

  it('sorts lexicographically the same as chronologically within a day', () => {
    const earlier = buildHistoryKey({
      prefix: 'sites',
      userId: 'u',
      siteId: 's',
      checkedAt: '2026-08-02T00:00:00.000Z',
      checkId: 'aaaaaaaa',
    });
    const later = buildHistoryKey({
      prefix: 'sites',
      userId: 'u',
      siteId: 's',
      checkedAt: '2026-08-02T00:00:00.001Z',
      checkId: 'bbbbbbbb',
    });
    expect(earlier < later).toBe(true);
  });
});

describe('writeHistoryRecord', () => {
  it('writes a JSON object to the documented key with schema_version', async () => {
    const s3Mock = mockClient(S3Client);
    s3Mock.on(PutObjectCommand).resolves({});

    const key = await writeHistoryRecord(s3Mock, {
      bucket: 'pulsemonitor-dev-monitoring-history',
      prefix: 'sites',
      record: {
        user_id: 'user-1',
        site_id: 'site-1',
        url: 'https://example.com',
        checked_at: '2026-08-02T14:05:03.123Z',
        status: 'up',
        status_code: 200,
        latency_ms: 143,
        error_type: null,
        error_message: null,
        region: 'us-east-1',
      },
    });

    expect(key).toMatch(/^sites\/user-1\/site-1\/2026\/08\/02\/\d+-[0-9a-f]{8}\.json$/);

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.Bucket).toBe('pulsemonitor-dev-monitoring-history');
    expect(call.args[0].input.ContentType).toBe('application/json');

    const body = JSON.parse(call.args[0].input.Body);
    expect(body.schema_version).toBe(1);
    expect(body.status).toBe('up');
  });
});
