const { randomUUID } = require('node:crypto');
const auditRepository = require('../repositories/auditRepository');
const logger = require('../utils/logger');
const config = require('../config/env');
const AppError = require('../errors/AppError');
const { decodeCursor, encodeCursor } = require('../utils/auditKeys');

const ANONYMOUS_PARTITION = '_anonymous';
const DEFAULT_LIMIT = 20;

// Never throws: a broken audit bucket or a transient S3 error must not fail
// the user's request that triggered it. This is an activity feed, not a
// compliance audit trail - a durable write guarantee would require a queue
// or an awaited write, either of which contradicts that requirement.
async function record(spec) {
  if (!config.auditBucket) {
    return;
  }

  const event = {
    schema_version: 1,
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    user_id: spec.user_id || ANONYMOUS_PARTITION,
    actor_email: spec.actor_email ?? null,
    event_type: spec.event_type,
    outcome: spec.outcome,
    resource_type: spec.resource_type ?? null,
    resource_id: spec.resource_id ?? null,
    method: spec.method ?? null,
    path: spec.path ?? null,
    status_code: spec.status_code ?? null,
    ip: spec.ip ?? null,
    user_agent: spec.user_agent ?? null,
    metadata: spec.metadata ?? {},
  };

  try {
    await auditRepository.putEvent(event);
  } catch (error) {
    logger.error('Failed to write audit event', error);
  }
}

async function listActivity(userId, { limit = DEFAULT_LIMIT, cursor } = {}) {
  if (!config.auditBucket) {
    throw new AppError(503, 'Activity log is not configured.');
  }

  let startAfter;
  if (cursor) {
    try {
      startAfter = decodeCursor(cursor, config.auditPrefix, userId);
    } catch {
      throw new AppError(400, 'Invalid cursor.');
    }
  }

  const { keys, nextCursorKey } = await auditRepository.listKeys({ userId, limit, startAfter });
  const rawEvents = await auditRepository.fetchEvents(keys);

  const events = rawEvents.map((event) => ({
    event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    resource_type: event.resource_type ?? null,
    resource_id: event.resource_id ?? null,
    outcome: event.outcome,
  }));

  const next_cursor = nextCursorKey ? encodeCursor(nextCursorKey, config.auditPrefix, userId) : null;

  return { events, next_cursor };
}

module.exports = { record, listActivity };
