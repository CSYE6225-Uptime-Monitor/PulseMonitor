const {
  prefixFor,
  buildKey,
  parseOccurredAtMs,
  isAuditKey,
  encodeCursor,
  decodeCursor,
} = require('../../src/utils/auditKeys');

describe('prefixFor', () => {
  it('joins prefix and user_id with a trailing slash', () => {
    expect(prefixFor('audit', 'u1')).toBe('audit/u1/');
  });
});

describe('buildKey', () => {
  it('builds a UTC day-partitioned key with a 13-digit epoch and an 8-char event id', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    expect(buildKey('audit', 'u1', ms, 'abcdef12')).toBe(`audit/u1/2026/08/02/${ms}-abcdef12.json`);
  });
});

describe('lexicographic ordering == chronological ordering', () => {
  it('orders day 02 before day 10 within a month', () => {
    const a = buildKey('audit', 'u1', Date.parse('2026-08-02T00:00:00.000Z'), 'aaaaaaaa');
    const b = buildKey('audit', 'u1', Date.parse('2026-08-10T00:00:00.000Z'), 'aaaaaaaa');
    expect(a < b).toBe(true);
  });

  it('orders 23:59:59.999 on one day before 00:00:00.000 on the next', () => {
    const a = buildKey('audit', 'u1', Date.parse('2026-08-02T23:59:59.999Z'), 'aaaaaaaa');
    const b = buildKey('audit', 'u1', Date.parse('2026-08-03T00:00:00.000Z'), 'aaaaaaaa');
    expect(a < b).toBe(true);
  });

  it('orders 2026/12/31 before 2027/01/01 across a year rollover', () => {
    const a = buildKey('audit', 'u1', Date.parse('2026-12-31T00:00:00.000Z'), 'aaaaaaaa');
    const b = buildKey('audit', 'u1', Date.parse('2027-01-01T00:00:00.000Z'), 'aaaaaaaa');
    expect(a < b).toBe(true);
  });

  it('sorts an array of shuffled keys into chronological order with a plain .sort()', () => {
    const timestamps = [
      '2026-12-30T00:00:00.000Z',
      '2026-12-30T12:00:00.000Z',
      '2026-12-31T23:59:59.999Z',
      '2027-01-01T00:00:00.000Z',
      '2027-01-02T04:00:00.000Z',
    ];
    const chronological = timestamps.map((t, i) => buildKey('audit', 'u1', Date.parse(t), String(i).padStart(8, '0')));

    const shuffled = [...chronological].reverse();
    expect(shuffled).not.toEqual(chronological);
    expect([...shuffled].sort()).toEqual(chronological);
  });
});

describe('parseOccurredAtMs', () => {
  it('extracts epoch_ms from a well-formed key', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const key = buildKey('audit', 'u1', ms, 'abcdef12');
    expect(parseOccurredAtMs(key, 'audit', 'u1')).toBe(ms);
  });

  it('returns null for a key that does not match the audit key shape', () => {
    expect(parseOccurredAtMs('audit/u1/latest.json', 'audit', 'u1')).toBeNull();
  });

  it('returns null for a key outside the given prefix (tenant isolation)', () => {
    const key = buildKey('audit', 'other-user', Date.parse('2026-08-02T14:05:03.123Z'), 'abcdef12');
    expect(parseOccurredAtMs(key, 'audit', 'u1')).toBeNull();
  });
});

describe('isAuditKey', () => {
  it('is true for a well-formed key', () => {
    const key = buildKey('audit', 'u1', Date.parse('2026-08-02T14:05:03.123Z'), 'abcdef12');
    expect(isAuditKey(key, 'audit', 'u1')).toBe(true);
  });

  it('is false for a foreign key under the same prefix', () => {
    expect(isAuditKey('audit/u1/latest.json', 'audit', 'u1')).toBe(false);
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips the user-relative suffix', () => {
    const key = buildKey('audit', 'u1', Date.parse('2026-08-02T14:05:03.123Z'), 'abcdef12');
    const cursor = encodeCursor(key, 'audit', 'u1');
    expect(decodeCursor(cursor, 'audit', 'u1')).toBe(key);
  });

  it('rejects a cursor whose decoded key escapes the user prefix (path traversal)', () => {
    const payload = Buffer.from(JSON.stringify({ v: 1, k: '../../other-user/2026/08/02/123-abcdef12.json' })).toString(
      'base64url'
    );
    expect(() => decodeCursor(payload, 'audit', 'u1')).toThrow();
  });

  it('rejects a cursor with an unknown version', () => {
    const payload = Buffer.from(JSON.stringify({ v: 2, k: '2026/08/02/123-abcdef12.json' })).toString('base64url');
    expect(() => decodeCursor(payload, 'audit', 'u1')).toThrow();
  });

  it('rejects a cursor that is not valid base64url JSON', () => {
    expect(() => decodeCursor('not-valid-base64!!!', 'audit', 'u1')).toThrow();
  });

  it('rejects encoding a key that is not under the given prefix', () => {
    const key = buildKey('audit', 'other-user', Date.parse('2026-08-02T14:05:03.123Z'), 'abcdef12');
    expect(() => encodeCursor(key, 'audit', 'u1')).toThrow();
  });
});
