const { randomUUID } = require('node:crypto');
const userService = require('./userService');
const siteService = require('./siteService');
const exportRepository = require('../repositories/exportRepository');
const historyRepository = require('../repositories/historyRepository');
const { boundaryKey } = require('../utils/historyKeys');
const config = require('../config/env');
const AppError = require('../errors/AppError');

// Bounded so a single export never fans out to thousands of GetObjects:
// worst case is EXPORT_MAX_SITES * one ListObjectsV2 + EXPORT_HISTORY_PER_SITE
// concurrent GetObjects (concurrency 8, via historyRepository.fetchRecords).
const EXPORT_MAX_SITES = 25;
const EXPORT_HISTORY_PER_SITE = 50;
// Same default window historyService.getHistory uses for an unfiltered
// request - "recent" history, not the site's entire lifetime.
const EXPORT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPORT_MIN_INTERVAL_MS = 60 * 1000;

function requireConfigured() {
  if (!config.userDataBucket) {
    throw new AppError(503, 'Export is not configured.');
  }
}

function latestExportMs(exports) {
  if (exports.length === 0) return null;
  return Number(exports[0].export_id.split('-')[0]);
}

async function buildHistoryForSite(userId, siteId) {
  const toMs = Date.now();
  const fromMs = toMs - EXPORT_HISTORY_WINDOW_MS;
  const startAfter = boundaryKey(config.historyPrefix, userId, siteId, fromMs);

  const { keys, nextCursorKey } = await historyRepository.listKeysInRange({
    userId,
    siteId,
    toMs,
    limit: EXPORT_HISTORY_PER_SITE,
    startAfter,
  });
  const records = await historyRepository.fetchRecords(keys);

  return { records, truncated: nextCursorKey !== null };
}

async function createExport(userId, email) {
  requireConfigured();

  const existing = await exportRepository.listExports(userId);
  const latestMs = latestExportMs(existing);
  if (latestMs !== null && Date.now() - latestMs < EXPORT_MIN_INTERVAL_MS) {
    throw new AppError(429, 'An export was requested too recently. Try again shortly.');
  }

  // getSelf already returns the toSafeUser projection - reusing it (rather
  // than re-deriving the projection here) means the export can never drift
  // from the API's own definition of "safe to expose", including if that
  // definition changes later.
  const profile = await userService.getSelf(email);

  const allSites = await siteService.listSites(userId);
  const sites = allSites.slice(0, EXPORT_MAX_SITES);
  const sites_truncated = allSites.length > EXPORT_MAX_SITES;

  const history = {};
  let history_truncated = false;
  for (const site of sites) {
    const { records, truncated } = await buildHistoryForSite(userId, site.site_id);
    history[site.site_id] = records;
    if (truncated) history_truncated = true;
  }

  const now = Date.now();
  const exportId8 = randomUUID().replace(/-/g, '').slice(0, 8);

  const bundle = {
    schema_version: 1,
    generated_at: new Date(now).toISOString(),
    profile,
    sites,
    sites_truncated,
    history,
    history_truncated,
  };

  await exportRepository.putExport(userId, now, exportId8, bundle);

  return {
    export_id: `${now}-${exportId8}`,
    status: 'ready',
    created_at: new Date(now).toISOString(),
    size_bytes: Buffer.byteLength(JSON.stringify(bundle)),
  };
}

async function listExports(userId) {
  requireConfigured();

  const exports = await exportRepository.listExports(userId);
  return exports.map((item) => ({
    export_id: item.export_id,
    status: 'ready',
    created_at: item.created_at,
    size_bytes: item.size_bytes,
  }));
}

async function getDownloadUrl(userId, exportId) {
  requireConfigured();

  // Never presign blind: confirm the id is actually in the caller's own
  // listing first, so a well-formed but wrong id 404s instead of minting a
  // credential for an object that may not even belong to this user.
  const exports = await exportRepository.listExports(userId);
  const match = exports.find((item) => item.export_id === exportId);
  if (!match) {
    throw new AppError(404, 'Export not found.');
  }

  const filename = `pulsemonitor-export-${exportId.split('-')[1]}.json`;
  const url = await exportRepository.presignDownload(userId, exportId, {
    filename,
    ttlSeconds: config.exportUrlTtlSeconds,
  });

  return {
    url,
    expires_at: new Date(Date.now() + config.exportUrlTtlSeconds * 1000).toISOString(),
    filename,
  };
}

module.exports = { createExport, listExports, getDownloadUrl };
