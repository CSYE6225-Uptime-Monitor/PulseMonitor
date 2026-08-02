const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../db/s3');
const config = require('../config/env');
const { runPool } = require('../utils/pool');
const { prefixFor, parseCheckedAtMs } = require('../utils/historyKeys');

const FETCH_CONCURRENCY = 8;
const MAX_S3_PAGE_SIZE = 1000;

// Lists history object keys under the site-scoped prefix, ascending
// chronologically (guaranteed by the key shape - see historyKeys.js),
// starting after `startAfter` and stopping at the first key past `toMs`.
// Because the list is ordered, that first out-of-range key proves every
// remaining key is also out of range, so listing stops immediately - no
// scanning of irrelevant objects.
async function listKeysInRange({ userId, siteId, toMs, limit, startAfter }) {
  const prefix = prefixFor(config.historyPrefix, userId, siteId);
  const keys = [];
  let continuationToken;
  let effectiveStartAfter = startAfter;
  let stoppedAtBoundary = false;
  let pageWasTruncated = false;

  while (keys.length < limit) {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: config.historyBucket,
        Prefix: prefix,
        MaxKeys: Math.min(limit - keys.length, MAX_S3_PAGE_SIZE),
        ...(continuationToken ? { ContinuationToken: continuationToken } : { StartAfter: effectiveStartAfter }),
      })
    );

    for (const obj of page.Contents || []) {
      const ms = parseCheckedAtMs(obj.Key, config.historyPrefix, userId, siteId);
      if (ms === null) continue; // foreign key under the same prefix - skip, don't corrupt the sequence
      if (ms > toMs) {
        stoppedAtBoundary = true;
        break;
      }
      keys.push(obj.Key);
      if (keys.length >= limit) break;
    }

    if (stoppedAtBoundary || keys.length >= limit) {
      pageWasTruncated = Boolean(page.IsTruncated) && !stoppedAtBoundary;
      break;
    }

    if (!page.IsTruncated) break;

    continuationToken = page.NextContinuationToken;
    effectiveStartAfter = undefined; // S3 ignores StartAfter once ContinuationToken is present
  }

  const nextCursorKey = pageWasTruncated && keys.length > 0 ? keys[keys.length - 1] : null;
  return { keys, nextCursorKey };
}

async function fetchRecords(keys) {
  const results = await runPool(keys, FETCH_CONCURRENCY, async (key) => {
    try {
      const obj = await s3Client.send(new GetObjectCommand({ Bucket: config.historyBucket, Key: key }));
      const body = await obj.Body.transformToString();
      const parsed = JSON.parse(body);

      return {
        check_id: parsed.check_id,
        site_id: parsed.site_id,
        url: parsed.url,
        checked_at: parsed.checked_at,
        status: parsed.status,
        status_code: parsed.status_code,
        latency_ms: parsed.latency_ms,
        error_type: parsed.error_type,
        error_message: parsed.error_message,
        region: parsed.region,
      };
    } catch (error) {
      // The 90-day lifecycle rule can expire an object between the list and
      // the get - skip it rather than failing the whole page.
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  });

  return results.filter((record) => record !== null);
}

module.exports = { listKeysInRange, fetchRecords };
