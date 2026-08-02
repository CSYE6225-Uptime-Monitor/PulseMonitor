const siteRepository = require('../repositories/siteRepository');
const historyRepository = require('../repositories/historyRepository');
const { boundaryKey, encodeCursor, decodeCursor } = require('../utils/historyKeys');
const config = require('../config/env');
const AppError = require('../errors/AppError');

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

async function getHistory(userId, siteId, { from, to, limit = 50, cursor } = {}) {
  const site = await siteRepository.findById(userId, siteId);
  if (!site) {
    throw new AppError(404, 'Site not found.');
  }

  const toMs = to ? Date.parse(to) : Date.now();
  const fromMs = from ? Date.parse(from) : toMs - DEFAULT_WINDOW_MS;

  if (fromMs >= toMs) {
    throw new AppError(400, 'from must be before to.');
  }

  const fromBoundaryKey = boundaryKey(config.historyPrefix, userId, siteId, fromMs);

  let startAfter = fromBoundaryKey;
  if (cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(cursor, config.historyPrefix, userId, siteId);
    } catch {
      throw new AppError(400, 'Invalid cursor.');
    }
    startAfter = cursorKey > fromBoundaryKey ? cursorKey : fromBoundaryKey;
  }

  const { keys, nextCursorKey } = await historyRepository.listKeysInRange({
    userId,
    siteId,
    toMs,
    limit,
    startAfter,
  });

  const records = await historyRepository.fetchRecords(keys);
  const next_cursor = nextCursorKey ? encodeCursor(nextCursorKey, config.historyPrefix, userId, siteId) : null;

  return { records, next_cursor };
}

module.exports = { getHistory };
