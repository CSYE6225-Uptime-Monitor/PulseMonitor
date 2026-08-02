const {
  prefixFor,
  boundaryKey,
  parseCheckedAtMs,
  isHistoryKey,
  encodeCursor,
  decodeCursor,
} = require('../../src/utils/historyKeys');

// Mirrors lambda/pinger/lib/history.js's buildHistoryKey format exactly
// (sites/{u}/{s}/{YYYY}/{MM}/{DD}/{epoch_ms}-{check_id8}.json) without
// cross-requiring the lambda package - see urlGuard's D3 rationale for why
// backend/lambda stay decoupled at the require level.
function realKeyAt(prefix, userId, siteId, isoString, checkId8 = 'abcdef12') {
  const d = new Date(isoString);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefixFor(prefix, userId, siteId)}${yyyy}/${mm}/${dd}/${d.getTime()}-${checkId8}.json`;
}

describe('prefixFor', () => {
  it('joins prefix, user_id, and site_id with a trailing slash', () => {
    expect(prefixFor('sites', 'u1', 's1')).toBe('sites/u1/s1/');
  });
});

describe('boundaryKey', () => {
  const ms = Date.parse('2026-08-02T14:05:03.123Z');

  it('builds a UTC day-partitioned key with a 13-digit epoch and no filename suffix', () => {
    expect(boundaryKey('sites', 'u1', 's1', ms)).toBe(`sites/u1/s1/2026/08/02/${ms}`);
  });

  it('sorts strictly below the real key at the same instant, making `from` inclusive', () => {
    const boundary = boundaryKey('sites', 'u1', 's1', ms);
    const realKey = realKeyAt('sites', 'u1', 's1', '2026-08-02T14:05:03.123Z');
    expect(boundary < realKey).toBe(true);
  });
});

describe('lexicographic ordering == chronological ordering', () => {
  it('orders day 02 before day 10 within a month', () => {
    const a = realKeyAt('sites', 'u1', 's1', '2026-08-02T00:00:00.000Z');
    const b = realKeyAt('sites', 'u1', 's1', '2026-08-10T00:00:00.000Z');
    expect(a < b).toBe(true);
  });

  it('orders 2026/08/31 before 2026/09/01 across a month rollover', () => {
    const a = realKeyAt('sites', 'u1', 's1', '2026-08-31T00:00:00.000Z');
    const b = realKeyAt('sites', 'u1', 's1', '2026-09-01T00:00:00.000Z');
    expect(a < b).toBe(true);
  });

  it('orders 2026/12/31 before 2027/01/01 across a year rollover', () => {
    const a = realKeyAt('sites', 'u1', 's1', '2026-12-31T00:00:00.000Z');
    const b = realKeyAt('sites', 'u1', 's1', '2027-01-01T00:00:00.000Z');
    expect(a < b).toBe(true);
  });

  it('orders two checks in the same day by epoch_ms', () => {
    const a = realKeyAt('sites', 'u1', 's1', '2026-08-02T01:00:00.000Z');
    const b = realKeyAt('sites', 'u1', 's1', '2026-08-02T23:00:00.000Z');
    expect(a < b).toBe(true);
  });

  it('sorts an array of shuffled keys into chronological order with a plain .sort()', () => {
    const timestamps = [
      '2026-12-30T00:00:00.000Z',
      '2026-12-30T12:00:00.000Z',
      '2026-12-31T00:00:00.000Z',
      '2026-12-31T23:59:59.999Z',
      '2027-01-01T00:00:00.000Z',
      '2027-01-01T06:00:00.000Z',
      '2027-01-01T18:00:00.000Z',
      '2027-01-02T00:00:00.000Z',
      '2027-01-02T01:00:00.000Z',
      '2027-01-02T02:00:00.000Z',
      '2027-01-02T03:00:00.000Z',
      '2027-01-02T04:00:00.000Z',
    ];
    const chronological = timestamps.map((t, i) => realKeyAt('sites', 'u1', 's1', t, String(i).padStart(8, '0')));

    const shuffled = [...chronological];
    // deterministic shuffle
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + 3) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    expect(shuffled).not.toEqual(chronological);
    expect([...shuffled].sort()).toEqual(chronological);
  });
});

describe('parseCheckedAtMs', () => {
  it('extracts epoch_ms from a well-formed key', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const key = realKeyAt('sites', 'u1', 's1', '2026-08-02T14:05:03.123Z');
    expect(parseCheckedAtMs(key, 'sites', 'u1', 's1')).toBe(ms);
  });

  it('returns null for a key that does not match the history key shape', () => {
    expect(parseCheckedAtMs('sites/u1/s1/latest.json', 'sites', 'u1', 's1')).toBeNull();
  });

  it('returns null for a key outside the given prefix', () => {
    const key = realKeyAt('sites', 'other-user', 's1', '2026-08-02T14:05:03.123Z');
    expect(parseCheckedAtMs(key, 'sites', 'u1', 's1')).toBeNull();
  });
});

describe('isHistoryKey', () => {
  it('is true for a well-formed key', () => {
    const key = realKeyAt('sites', 'u1', 's1', '2026-08-02T14:05:03.123Z');
    expect(isHistoryKey(key, 'sites', 'u1', 's1')).toBe(true);
  });

  it('is false for a foreign key under the same prefix', () => {
    expect(isHistoryKey('sites/u1/s1/latest.json', 'sites', 'u1', 's1')).toBe(false);
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips the site-relative suffix', () => {
    const key = realKeyAt('sites', 'u1', 's1', '2026-08-02T14:05:03.123Z');
    const cursor = encodeCursor(key, 'sites', 'u1', 's1');
    expect(decodeCursor(cursor, 'sites', 'u1', 's1')).toBe(key);
  });

  it('rejects a cursor whose decoded key escapes the site prefix', () => {
    const payload = Buffer.from(JSON.stringify({ v: 1, k: '../../other-user/s/2026/08/02/123-abcdef12.json' })).toString(
      'base64url'
    );
    expect(() => decodeCursor(payload, 'sites', 'u1', 's1')).toThrow();
  });

  it('rejects a cursor with an unknown version', () => {
    const payload = Buffer.from(JSON.stringify({ v: 2, k: '2026/08/02/123-abcdef12.json' })).toString('base64url');
    expect(() => decodeCursor(payload, 'sites', 'u1', 's1')).toThrow();
  });

  it('rejects a cursor that is not valid base64url JSON', () => {
    expect(() => decodeCursor('not-valid-base64!!!', 'sites', 'u1', 's1')).toThrow();
  });
});
