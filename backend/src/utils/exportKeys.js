// Key shape: {prefix}/{user_id}/{epoch_ms}-{export_id8}.json
//
// No day partition (unlike auditKeys.js): the object count per user is tiny
// (throttled to one export per minute - see exportService.js), so a flat
// listing under the pinned `{prefix}/{user_id}/` prefix is cheap, and the
// fixed-width 13-digit epoch still makes it chronologically sortable.
const EXPORT_ID_RE = /^(\d{13})-([0-9a-f]{8})$/;
const EXPORT_KEY_SUFFIX_RE = /^(\d{13})-([0-9a-f]{8})\.json$/;

function prefixFor(prefix, userId) {
  return `${prefix}/${userId}/`;
}

function buildKey(prefix, userId, epochMs, exportId8) {
  return `${prefixFor(prefix, userId)}${epochMs}-${exportId8}.json`;
}

function isValidExportId(id) {
  return typeof id === 'string' && EXPORT_ID_RE.test(id);
}

// Always splices in the *session's* user_id, so an id (however it was
// obtained) can never be used to address another tenant's prefix - the id
// itself carries no trust, only the caller's own session does. The id must
// additionally match the export id shape, which also rejects path-traversal
// attempts (they don't start with 13 digits).
function keyFromId(prefix, userId, id) {
  if (!isValidExportId(id)) {
    throw new Error('invalid_export_id');
  }
  return `${prefixFor(prefix, userId)}${id}.json`;
}

function idFromKey(fullKey, prefix, userId) {
  const p = prefixFor(prefix, userId);
  if (!fullKey.startsWith(p)) return null;

  const match = EXPORT_KEY_SUFFIX_RE.exec(fullKey.slice(p.length));
  return match ? `${match[1]}-${match[2]}` : null;
}

module.exports = { prefixFor, buildKey, keyFromId, idFromKey, isValidExportId };
