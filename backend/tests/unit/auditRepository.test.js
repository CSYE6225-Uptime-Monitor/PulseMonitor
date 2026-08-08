const { mockClient } = require('aws-sdk-client-mock');
const { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const { s3Client } = require('../../src/db/s3');
const auditRepository = require('../../src/repositories/auditRepository');
const { prefixFor, buildKey } = require('../../src/utils/auditKeys');

const s3Mock = mockClient(s3Client);

const PREFIX = 'audit';
const USER_ID = 'u1';
const BUCKET = 'pulsemonitor-test-audit-logs';

function keyAt(isoString, eventId8 = 'abcdef12') {
  return buildKey(PREFIX, USER_ID, new Date(isoString).getTime(), eventId8);
}

function fakeBody(obj) {
  return { transformToString: async () => JSON.stringify(obj) };
}

describe('auditRepository.putEvent', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('writes the event JSON to the audit bucket under the day-partitioned key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const event = {
      schema_version: 1,
      event_id: 'abcdef12-3456-7890-abcd-ef1234567890',
      occurred_at: '2026-08-02T14:05:03.123Z',
      user_id: USER_ID,
      event_type: 'site.created',
      outcome: 'success',
    };

    await auditRepository.putEvent(event);

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.Bucket).toBe(BUCKET);
    expect(call.args[0].input.Key).toBe(keyAt('2026-08-02T14:05:03.123Z', 'abcdef12'));
    expect(call.args[0].input.ContentType).toBe('application/json');
    expect(JSON.parse(call.args[0].input.Body)).toEqual(event);
  });
});

describe('auditRepository.listKeys', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('lists with the user-scoped Prefix and forwards StartAfter/MaxKeys', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    await auditRepository.listKeys({ userId: USER_ID, limit: 20, startAfter: undefined });

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.Bucket).toBe(BUCKET);
    expect(call.args[0].input.Prefix).toBe(prefixFor(PREFIX, USER_ID));
    expect(call.args[0].input.MaxKeys).toBe(20);
  });

  it('follows NextContinuationToken and drops StartAfter on the continuation call', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: k1 }], IsTruncated: true, NextContinuationToken: 'tok' })
      .resolvesOnce({ Contents: [{ Key: k2 }], IsTruncated: false });

    const result = await auditRepository.listKeys({ userId: USER_ID, limit: 50 });

    expect(result.keys).toEqual([k1, k2]);
    const calls = s3Mock.commandCalls(ListObjectsV2Command);
    expect(calls).toHaveLength(2);
    expect(calls[1].args[0].input.ContinuationToken).toBe('tok');
    expect(calls[1].args[0].input.StartAfter).toBeUndefined();
  });

  it('returns a next_cursor built from the last listed key when the page fills', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }, { Key: k2 }], IsTruncated: true });

    const result = await auditRepository.listKeys({ userId: USER_ID, limit: 2 });

    expect(result.keys).toEqual([k1, k2]);
    expect(result.nextCursorKey).toBe(k2);
  });

  it('returns next_cursor null when the last page is not truncated', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }], IsTruncated: false });

    const result = await auditRepository.listKeys({ userId: USER_ID, limit: 50 });

    expect(result.nextCursorKey).toBeNull();
  });

  it('ignores keys that do not match the audit key shape', async () => {
    const foreign = `${prefixFor(PREFIX, USER_ID)}latest.json`;
    const valid = keyAt('2026-08-02T01:00:00.000Z');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: foreign }, { Key: valid }], IsTruncated: false });

    const result = await auditRepository.listKeys({ userId: USER_ID, limit: 50 });

    expect(result.keys).toEqual([valid]);
  });
});

describe('auditRepository.fetchEvents', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('issues one GetObject per key with the right Bucket and Key', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    s3Mock.on(GetObjectCommand).resolves({
      Body: fakeBody({ event_id: 'e1', event_type: 'site.created', occurred_at: '2026-08-02T01:00:00.000Z' }),
    });

    await auditRepository.fetchEvents([k1]);

    const call = s3Mock.commandCalls(GetObjectCommand)[0];
    expect(call.args[0].input).toEqual({ Bucket: BUCKET, Key: k1 });
  });

  it('never exceeds a concurrency of 8', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const keys = Array.from({ length: 20 }, (_, i) => keyAt('2026-08-02T01:00:00.000Z', String(i).padStart(8, '0')));

    s3Mock.on(GetObjectCommand).callsFake(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return { Body: fakeBody({ event_id: 'e', event_type: 'site.created', occurred_at: '2026-08-02T01:00:00.000Z' }) };
    });

    await auditRepository.fetchEvents(keys);

    expect(maxInFlight).toBeLessThanOrEqual(8);
  });

  it('skips a key whose GetObject rejects with NoSuchKey instead of failing the page', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    const noSuchKey = new Error('not found');
    noSuchKey.name = 'NoSuchKey';

    s3Mock
      .on(GetObjectCommand, { Bucket: BUCKET, Key: k1 })
      .rejects(noSuchKey)
      .on(GetObjectCommand, { Bucket: BUCKET, Key: k2 })
      .resolves({ Body: fakeBody({ event_id: 'e2', event_type: 'site.created', occurred_at: '2026-08-02T02:00:00.000Z' }) });

    const events = await auditRepository.fetchEvents([k1, k2]);

    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe('e2');
  });
});
