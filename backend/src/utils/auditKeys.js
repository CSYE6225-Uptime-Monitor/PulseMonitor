// Sibling of historyKeys.js, not a generalization of it: historyKeys' every
// signature is (prefix, userId, siteId) and its suffix regex is anchored past
// `{user}/{site}/`, so it can't be reused here without churning a file that
// has a complete passing test suite for zero functional gain. Key shape:
// {prefix}/{user_id}/{YYYY}/{MM}/{DD}/{epoch_ms}-{event_id8}.json
//
// Unlike history (where site_id sits between user_id and the date, so a
// listing at `{prefix}/{user_id}/` is NOT guaranteed chronological), audit
// has no such segment: the pinned prefix is `{prefix}/{user_id}/` and the
// very next byte is the year, so ascending UTF-8 byte order of the suffix is
// identical to chronological order - one ListObjectsV2 + StartAfter is a
// free pagination cursor.
const AUDIT_KEY_SUFFIX_RE = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{13})-([0-9a-f]{8})\.json$/;

function prefixFor(prefix, userId) {
  return `${prefix}/${userId}/`;
}

function buildKey(prefix, userId, occurredAtMs, eventId8) {
  const d = new Date(occurredAtMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefixFor(prefix, userId)}${yyyy}/${mm}/${dd}/${occurredAtMs}-${eventId8}.json`;
}

function parseOccurredAtMs(fullKey, prefix, userId) {
  const p = prefixFor(prefix, userId);
  if (!fullKey.startsWith(p)) return null;

  const match = AUDIT_KEY_SUFFIX_RE.exec(fullKey.slice(p.length));
  return match ? Number(match[4]) : null;
}

function isAuditKey(fullKey, prefix, userId) {
  return parseOccurredAtMs(fullKey, prefix, userId) !== null;
}

// The public pagination cursor carries only the user-relative key suffix, so
// the server always rebuilds the full key from the *session's* user_id - a
// forged cursor cannot address another tenant's prefix. The suffix must
// additionally match the audit key shape, which also rejects path-traversal
// attempts (they don't start with 4 digits).
function encodeCursor(fullKey, prefix, userId) {
  const p = prefixFor(prefix, userId);
  if (!fullKey.startsWith(p)) {
    throw new Error('key is not under the given prefix');
  }
  const relative = fullKey.slice(p.length);
  return Buffer.from(JSON.stringify({ v: 1, k: relative })).toString('base64url');
}

function decodeCursor(cursor, prefix, userId) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_cursor');
  }

  if (!payload || payload.v !== 1 || typeof payload.k !== 'string' || !AUDIT_KEY_SUFFIX_RE.test(payload.k)) {
    throw new Error('invalid_cursor');
  }

  return `${prefixFor(prefix, userId)}${payload.k}`;
}

module.exports = { prefixFor, buildKey, parseOccurredAtMs, isAuditKey, encodeCursor, decodeCursor };
