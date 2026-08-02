// Companion to lambda/pinger/lib/history.js's write path. Key shape:
// {prefix}/{user_id}/{site_id}/{YYYY}/{MM}/{DD}/{epoch_ms}-{check_id8}.json
//
// Every field is fixed-width and zero-padded, so under a pinned
// `{prefix}/{user_id}/{site_id}/` prefix, ascending UTF-8 byte order of the
// remaining suffix is identical to chronological order - a plain
// ListObjectsV2 call needs no per-day iteration. This does NOT extend to a
// listing at `{prefix}/{user_id}/` (unpinned site_id) - do not reuse these
// helpers for a cross-site listing.
const HISTORY_KEY_SUFFIX_RE = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{13})-([0-9a-f]{8})\.json$/;

function prefixFor(prefix, userId, siteId) {
  return `${prefix}/${userId}/${siteId}/`;
}

// Builds the StartAfter boundary for a `from` timestamp. Deliberately has no
// filename suffix, so it sorts strictly below the real key emitted at the
// exact same instant (which always has a `-{check_id8}.json` suffix) -
// that's what makes `from` inclusive with no off-by-one.
function boundaryKey(prefix, userId, siteId, ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefixFor(prefix, userId, siteId)}${yyyy}/${mm}/${dd}/${ms}`;
}

function parseCheckedAtMs(fullKey, prefix, userId, siteId) {
  const p = prefixFor(prefix, userId, siteId);
  if (!fullKey.startsWith(p)) return null;

  const match = HISTORY_KEY_SUFFIX_RE.exec(fullKey.slice(p.length));
  return match ? Number(match[4]) : null;
}

function isHistoryKey(fullKey, prefix, userId, siteId) {
  return parseCheckedAtMs(fullKey, prefix, userId, siteId) !== null;
}

// The public pagination cursor carries only the site-relative key suffix, so
// the server always rebuilds the full key from the *session's* user_id/site_id
// - a forged cursor cannot address another tenant's prefix. The suffix must
// additionally match the history key shape, which also rejects path-traversal
// attempts (they don't start with 4 digits).
function encodeCursor(fullKey, prefix, userId, siteId) {
  const p = prefixFor(prefix, userId, siteId);
  if (!fullKey.startsWith(p)) {
    throw new Error('key is not under the given prefix');
  }
  const relative = fullKey.slice(p.length);
  return Buffer.from(JSON.stringify({ v: 1, k: relative })).toString('base64url');
}

function decodeCursor(cursor, prefix, userId, siteId) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_cursor');
  }

  if (!payload || payload.v !== 1 || typeof payload.k !== 'string' || !HISTORY_KEY_SUFFIX_RE.test(payload.k)) {
    throw new Error('invalid_cursor');
  }

  return `${prefixFor(prefix, userId, siteId)}${payload.k}`;
}

module.exports = { prefixFor, boundaryKey, parseCheckedAtMs, isHistoryKey, encodeCursor, decodeCursor };
