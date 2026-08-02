const { mockClient } = require('aws-sdk-client-mock');
const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const { s3Client } = require('../../src/db/s3');
const historyRepository = require('../../src/repositories/historyRepository');
const { prefixFor, boundaryKey } = require('../../src/utils/historyKeys');

const s3Mock = mockClient(s3Client);

const PREFIX = 'sites';
const USER_ID = 'u1';
const SITE_ID = 's1';
const BUCKET = 'pulsemonitor-test-history';

function keyAt(isoString, checkId8 = 'abcdef12') {
  const d = new Date(isoString);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefixFor(PREFIX, USER_ID, SITE_ID)}${yyyy}/${mm}/${dd}/${d.getTime()}-${checkId8}.json`;
}

function fakeBody(obj) {
  return { transformToString: async () => JSON.stringify(obj) };
}

describe('historyRepository.listKeysInRange', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('lists with the site-scoped Prefix and the from-boundary as StartAfter', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const fromMs = Date.parse('2026-08-02T00:00:00.000Z');
    const startAfter = boundaryKey(PREFIX, USER_ID, SITE_ID, fromMs);

    await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 50,
      startAfter,
    });

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.Bucket).toBe(BUCKET);
    expect(call.args[0].input.Prefix).toBe(prefixFor(PREFIX, USER_ID, SITE_ID));
    expect(call.args[0].input.StartAfter).toBe(startAfter);
    expect(call.args[0].input.MaxKeys).toBe(50);
  });

  it('follows NextContinuationToken and drops StartAfter on the continuation call', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    s3Mock
      .on(ListObjectsV2Command)
      .resolvesOnce({ Contents: [{ Key: k1 }], IsTruncated: true, NextContinuationToken: 'tok' })
      .resolvesOnce({ Contents: [{ Key: k2 }], IsTruncated: false });

    const result = await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 50,
      startAfter: boundaryKey(PREFIX, USER_ID, SITE_ID, Date.parse('2026-08-02T00:00:00.000Z')),
    });

    expect(result.keys).toEqual([k1, k2]);
    const calls = s3Mock.commandCalls(ListObjectsV2Command);
    expect(calls).toHaveLength(2);
    expect(calls[1].args[0].input.ContinuationToken).toBe('tok');
    expect(calls[1].args[0].input.StartAfter).toBeUndefined();
  });

  it('stops listing at the first key past the to boundary and returns next_cursor null', async () => {
    const inRange1 = keyAt('2026-08-02T01:00:00.000Z');
    const inRange2 = keyAt('2026-08-02T02:00:00.000Z');
    const outOfRange = keyAt('2026-08-05T00:00:00.000Z');

    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: inRange1 }, { Key: inRange2 }, { Key: outOfRange }],
      IsTruncated: false,
    });

    const result = await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 50,
      startAfter: boundaryKey(PREFIX, USER_ID, SITE_ID, Date.parse('2026-08-02T00:00:00.000Z')),
    });

    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(1);
    expect(result.keys).toEqual([inRange1, inRange2]);
    expect(result.nextCursorKey).toBeNull();
  });

  it('returns a next_cursor built from the last listed key when the page fills', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }, { Key: k2 }], IsTruncated: true });

    const result = await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 2,
      startAfter: boundaryKey(PREFIX, USER_ID, SITE_ID, Date.parse('2026-08-02T00:00:00.000Z')),
    });

    expect(result.keys).toEqual([k1, k2]);
    expect(result.nextCursorKey).toBe(k2);
  });

  it('ignores keys that do not match the history key shape', async () => {
    const foreign = `${prefixFor(PREFIX, USER_ID, SITE_ID)}latest.json`;
    const valid = keyAt('2026-08-02T01:00:00.000Z');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: foreign }, { Key: valid }], IsTruncated: false });

    const result = await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 50,
      startAfter: boundaryKey(PREFIX, USER_ID, SITE_ID, Date.parse('2026-08-02T00:00:00.000Z')),
    });

    expect(result.keys).toEqual([valid]);
  });

  it('passes MaxKeys as the remaining record budget, capped at 1000', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    await historyRepository.listKeysInRange({
      userId: USER_ID,
      siteId: SITE_ID,
      toMs: Date.parse('2026-08-03T00:00:00.000Z'),
      limit: 1500,
      startAfter: boundaryKey(PREFIX, USER_ID, SITE_ID, Date.parse('2026-08-02T00:00:00.000Z')),
    });

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.MaxKeys).toBe(1000);
  });
});

describe('historyRepository.fetchRecords', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('issues one GetObject per key with the right Bucket and Key', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    s3Mock.on(GetObjectCommand).resolves({
      Body: fakeBody({ check_id: 'c1', site_id: SITE_ID, checked_at: '2026-08-02T01:00:00.000Z', status: 'up' }),
    });

    await historyRepository.fetchRecords([k1]);

    const call = s3Mock.commandCalls(GetObjectCommand)[0];
    expect(call.args[0].input).toEqual({ Bucket: BUCKET, Key: k1 });
  });

  it('never exceeds the configured GetObject concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const keys = Array.from({ length: 20 }, (_, i) => keyAt(`2026-08-02T0${i % 9}:00:00.000Z`, String(i).padStart(8, '0')));

    s3Mock.on(GetObjectCommand).callsFake(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return { Body: fakeBody({ check_id: 'c', site_id: SITE_ID, checked_at: '2026-08-02T01:00:00.000Z', status: 'up' }) };
    });

    await historyRepository.fetchRecords(keys);

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
      .resolves({ Body: fakeBody({ check_id: 'c2', site_id: SITE_ID, checked_at: '2026-08-02T02:00:00.000Z', status: 'up' }) });

    const records = await historyRepository.fetchRecords([k1, k2]);

    expect(records).toHaveLength(1);
    expect(records[0].check_id).toBe('c2');
  });

  it('projects only the contract fields, dropping schema_version and user_id', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    s3Mock.on(GetObjectCommand).resolves({
      Body: fakeBody({
        schema_version: 1,
        check_id: 'c1',
        user_id: USER_ID,
        site_id: SITE_ID,
        url: 'https://example.com',
        checked_at: '2026-08-02T01:00:00.000Z',
        status: 'up',
        status_code: 200,
        latency_ms: 143,
        error_type: null,
        error_message: null,
        region: 'us-east-1',
      }),
    });

    const [record] = await historyRepository.fetchRecords([k1]);

    expect(record).not.toHaveProperty('schema_version');
    expect(record).not.toHaveProperty('user_id');
    expect(Object.keys(record).sort()).toEqual(
      ['check_id', 'site_id', 'url', 'checked_at', 'status', 'status_code', 'latency_ms', 'error_type', 'error_message', 'region'].sort()
    );
  });

  it('preserves chronological order even when gets resolve out of order', async () => {
    const k1 = keyAt('2026-08-02T01:00:00.000Z');
    const k2 = keyAt('2026-08-02T02:00:00.000Z');

    s3Mock
      .on(GetObjectCommand, { Bucket: BUCKET, Key: k1 })
      .callsFake(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { Body: fakeBody({ check_id: 'first', site_id: SITE_ID, checked_at: '2026-08-02T01:00:00.000Z', status: 'up' }) };
      })
      .on(GetObjectCommand, { Bucket: BUCKET, Key: k2 })
      .resolves({ Body: fakeBody({ check_id: 'second', site_id: SITE_ID, checked_at: '2026-08-02T02:00:00.000Z', status: 'up' }) });

    const records = await historyRepository.fetchRecords([k1, k2]);

    expect(records.map((r) => r.check_id)).toEqual(['first', 'second']);
  });
});
