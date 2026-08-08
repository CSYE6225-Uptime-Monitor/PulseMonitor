const { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../db/s3');
const config = require('../config/env');
const { prefixFor, buildKey, keyFromId, idFromKey } = require('../utils/exportKeys');

const MAX_EXPORTS_PAGE_SIZE = 100;

async function putExport(userId, epochMs, exportId8, bundle) {
  const key = buildKey(config.exportPrefix, userId, epochMs, exportId8);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.userDataBucket,
      Key: key,
      Body: JSON.stringify(bundle),
      ContentType: 'application/json',
    })
  );
}

// Exactly one ListObjectsV2 and zero GetObjects: export_id and created_at
// derive from the key, size_bytes from the listing's Size field. Per-user
// export counts are small (throttled to one per minute), so a single page
// covers every export a user will realistically have.
async function listExports(userId) {
  const page = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: config.userDataBucket,
      Prefix: prefixFor(config.exportPrefix, userId),
      MaxKeys: MAX_EXPORTS_PAGE_SIZE,
    })
  );

  const exports = [];
  for (const obj of page.Contents || []) {
    const exportId = idFromKey(obj.Key, config.exportPrefix, userId);
    if (exportId === null) continue; // foreign key under the same prefix - skip

    const epochMs = Number(exportId.split('-')[0]);
    exports.push({
      export_id: exportId,
      created_at: new Date(epochMs).toISOString(),
      size_bytes: obj.Size,
    });
  }

  return exports.sort((a, b) => b.export_id.localeCompare(a.export_id));
}

async function presignDownload(userId, exportId, { filename, ttlSeconds }) {
  const key = keyFromId(config.exportPrefix, userId, exportId);

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: config.userDataBucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
      ResponseContentType: 'application/json',
    }),
    { expiresIn: ttlSeconds }
  );
}

module.exports = { putExport, listExports, presignDownload };
