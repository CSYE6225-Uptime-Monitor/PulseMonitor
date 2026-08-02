const { randomUUID } = require('node:crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

// Key layout: {prefix}/{user_id}/{site_id}/{YYYY}/{MM}/{DD}/{epoch_ms}-{check_id8}.json
// Fixed-width epoch_ms means lexicographic order == chronological order within
// a day partition, so ListObjectsV2 + StartAfter is a free pagination cursor
// for the history API (PM-18). Do not change this shape once data exists.
function buildHistoryKey({ prefix, userId, siteId, checkedAt, checkId }) {
  const d = new Date(checkedAt);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const epochMs = d.getTime();
  const shortId = (checkId || randomUUID()).replace(/-/g, '').slice(0, 8);
  return `${prefix}/${userId}/${siteId}/${yyyy}/${mm}/${dd}/${epochMs}-${shortId}.json`;
}

async function writeHistoryRecord(s3Client, { bucket, prefix, record }) {
  const checkId = randomUUID();
  const key = buildHistoryKey({
    prefix,
    userId: record.user_id,
    siteId: record.site_id,
    checkedAt: record.checked_at,
    checkId,
  });

  const body = JSON.stringify({
    schema_version: 1,
    check_id: checkId,
    ...record,
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'max-age=31536000, immutable',
    }),
  );

  return key;
}

module.exports = { buildHistoryKey, writeHistoryRecord };
