const { prefixFor, buildKey, keyFromId, idFromKey, isValidExportId } = require('../../src/utils/exportKeys');

describe('prefixFor', () => {
  it('joins prefix and user_id with a trailing slash', () => {
    expect(prefixFor('exports', 'u1')).toBe('exports/u1/');
  });
});

describe('buildKey', () => {
  it('builds a flat key with a 13-digit epoch and an 8-char export id', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    expect(buildKey('exports', 'u1', ms, 'abcdef12')).toBe(`exports/u1/${ms}-abcdef12.json`);
  });
});

describe('keyFromId', () => {
  it('splices the given (session) user_id into the key, ignoring any id claim about tenancy', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const id = `${ms}-abcdef12`;
    expect(keyFromId('exports', 'u1', id)).toBe(`exports/u1/${ms}-abcdef12.json`);
  });

  it('rejects an id containing a path traversal segment', () => {
    expect(() => keyFromId('exports', 'u1', '../../other-user/1234567890123-abcdef12')).toThrow();
  });

  it('rejects an id with a 12-digit epoch', () => {
    expect(() => keyFromId('exports', 'u1', '123456789012-abcdef12')).toThrow();
  });

  it('rejects an id with uppercase hex', () => {
    expect(() => keyFromId('exports', 'u1', '1234567890123-ABCDEF12')).toThrow();
  });

  it('rejects an id with url-encoded traversal', () => {
    expect(() => keyFromId('exports', 'u1', '..%2f1234567890123-abcdef12')).toThrow();
  });
});

describe('idFromKey', () => {
  it('round-trips through buildKey / keyFromId / idFromKey', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const key = buildKey('exports', 'u1', ms, 'abcdef12');
    const id = idFromKey(key, 'exports', 'u1');
    expect(id).toBe(`${ms}-abcdef12`);
    expect(keyFromId('exports', 'u1', id)).toBe(key);
  });

  it('returns null for a key outside the given prefix', () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const key = buildKey('exports', 'other-user', ms, 'abcdef12');
    expect(idFromKey(key, 'exports', 'u1')).toBeNull();
  });

  it('returns null for a key that does not match the export key shape', () => {
    expect(idFromKey('exports/u1/latest.json', 'exports', 'u1')).toBeNull();
  });
});

describe('isValidExportId', () => {
  it('accepts a well-formed id', () => {
    expect(isValidExportId('1234567890123-abcdef12')).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isValidExportId('not-an-id')).toBe(false);
    expect(isValidExportId('123-abcdef12')).toBe(false);
    expect(isValidExportId('1234567890123-ABCDEF12')).toBe(false);
  });
});
