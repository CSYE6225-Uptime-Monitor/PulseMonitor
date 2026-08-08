const { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../db/s3');
const config = require('../config/env');
const { runPool } = require('../utils/pool');
const { prefixFor, buildKey, parseOccurredAtMs } = require('../utils/auditKeys');

const FETCH_CONCURRENCY = 8;
const MAX_S3_PAGE_SIZE = 1000;

function eventId8(eventId) {
  return eventId.replace(/-/g, '').slice(0, 8);
}

async function putEvent(event) {
  const occurredAtMs = Date.parse(event.occurred_at);
  const key = buildKey(config.auditPrefix, event.user_id, occurredAtMs, eventId8(event.event_id));

  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.auditBucket,
      Key: key,
      Body: JSON.stringify(event),
      ContentType: 'application/json',
    })
  );
}

// Lists audit object keys under the user-scoped prefix, ascending
// chronologically (guaranteed by the key shape - see auditKeys.js), starting
// after `startAfter`. Unlike historyRepository.listKeysInRange, there is no
// upper (`toMs`) boundary - an activity feed has no time-range filter today.
async function listKeys({ userId, limit, startAfter }) {
  const prefix = prefixFor(config.auditPrefix, userId);
  const keys = [];
  let continuationToken;
  let effectiveStartAfter = startAfter;
  let pageWasTruncated = false;

  while (keys.length < limit) {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: config.auditBucket,
        Prefix: prefix,
        MaxKeys: Math.min(limit - keys.length, MAX_S3_PAGE_SIZE),
        ...(continuationToken ? { ContinuationToken: continuationToken } : { StartAfter: effectiveStartAfter }),
      })
    );

    for (const obj of page.Contents || []) {
      const ms = parseOccurredAtMs(obj.Key, config.auditPrefix, userId);
      if (ms === null) continue; // foreign key under the same prefix - skip, don't corrupt the sequence
      keys.push(obj.Key);
      if (keys.length >= limit) break;
    }

    if (keys.length >= limit) {
      pageWasTruncated = Boolean(page.IsTruncated);
      break;
    }

    if (!page.IsTruncated) break;

    continuationToken = page.NextContinuationToken;
    effectiveStartAfter = undefined; // S3 ignores StartAfter once ContinuationToken is present
  }

  const nextCursorKey = pageWasTruncated && keys.length > 0 ? keys[keys.length - 1] : null;
  return { keys, nextCursorKey };
}

async function fetchEvents(keys) {
  const results = await runPool(keys, FETCH_CONCURRENCY, async (key) => {
    try {
      const obj = await s3Client.send(new GetObjectCommand({ Bucket: config.auditBucket, Key: key }));
      const body = await obj.Body.transformToString();
      return JSON.parse(body);
    } catch (error) {
      // The retention lifecycle rule can expire an object between the list
      // and the get - skip it rather than failing the whole page.
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  });

  return results.filter((event) => event !== null);
}

module.exports = { putEvent, listKeys, fetchEvents };
