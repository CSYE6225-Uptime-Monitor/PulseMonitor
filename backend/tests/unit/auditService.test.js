jest.mock('../../src/repositories/auditRepository');
jest.mock('../../src/utils/logger');

const auditRepository = require('../../src/repositories/auditRepository');
const logger = require('../../src/utils/logger');
const auditService = require('../../src/services/auditService');
const { encodeCursor } = require('../../src/utils/auditKeys');
const config = require('../../src/config/env');
const AppError = require('../../src/errors/AppError');

const USER_ID = 'u1';

describe('auditService.record', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without throwing even when putEvent rejects', async () => {
    auditRepository.putEvent.mockRejectedValue(new Error('S3 is down'));

    await expect(
      auditService.record({ user_id: USER_ID, event_type: 'site.created', outcome: 'success' })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });

  it('resolves when putEvent succeeds', async () => {
    auditRepository.putEvent.mockResolvedValue(undefined);

    await expect(
      auditService.record({ user_id: USER_ID, event_type: 'site.created', outcome: 'success' })
    ).resolves.toBeUndefined();
  });

  it('builds an event with schema_version, a generated event_id, and occurred_at', async () => {
    auditRepository.putEvent.mockResolvedValue(undefined);

    await auditService.record({ user_id: USER_ID, event_type: 'site.created', outcome: 'success' });

    const event = auditRepository.putEvent.mock.calls[0][0];
    expect(event.schema_version).toBe(1);
    expect(typeof event.event_id).toBe('string');
    expect(event.event_id.length).toBeGreaterThan(0);
    expect(() => new Date(event.occurred_at).toISOString()).not.toThrow();
    expect(event.user_id).toBe(USER_ID);
    expect(event.event_type).toBe('site.created');
    expect(event.outcome).toBe('success');
  });

  it('writes under the _anonymous partition when user_id is null', async () => {
    auditRepository.putEvent.mockResolvedValue(undefined);

    await auditService.record({ user_id: null, event_type: 'auth.login.failed', outcome: 'failure' });

    const event = auditRepository.putEvent.mock.calls[0][0];
    expect(event.user_id).toBe('_anonymous');
  });

  it('passes through resource_type, resource_id, method, path, status_code, ip, user_agent, metadata', async () => {
    auditRepository.putEvent.mockResolvedValue(undefined);

    await auditService.record({
      user_id: USER_ID,
      event_type: 'site.updated',
      outcome: 'success',
      resource_type: 'site',
      resource_id: 's1',
      method: 'PUT',
      path: '/v1/sites/s1',
      status_code: 200,
      ip: '1.2.3.4',
      user_agent: 'test-agent',
      metadata: { changed_fields: ['name'] },
    });

    const event = auditRepository.putEvent.mock.calls[0][0];
    expect(event.resource_type).toBe('site');
    expect(event.resource_id).toBe('s1');
    expect(event.method).toBe('PUT');
    expect(event.path).toBe('/v1/sites/s1');
    expect(event.status_code).toBe(200);
    expect(event.ip).toBe('1.2.3.4');
    expect(event.user_agent).toBe('test-agent');
    expect(event.metadata).toEqual({ changed_fields: ['name'] });
  });

  it('no-ops without calling putEvent when the audit bucket is not configured', async () => {
    const original = config.auditBucket;
    config.auditBucket = undefined;

    await auditService.record({ user_id: USER_ID, event_type: 'site.created', outcome: 'success' });

    expect(auditRepository.putEvent).not.toHaveBeenCalled();
    config.auditBucket = original;
  });
});

describe('auditService.listActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws 503 when the audit bucket is not configured', async () => {
    const original = config.auditBucket;
    config.auditBucket = undefined;

    await expect(auditService.listActivity(USER_ID, {})).rejects.toMatchObject({ statusCode: 503 });

    config.auditBucket = original;
  });

  it('lists and fetches events, mapping to the public shape', async () => {
    auditRepository.listKeys.mockResolvedValue({ keys: ['k1'], nextCursorKey: null });
    auditRepository.fetchEvents.mockResolvedValue([
      {
        event_id: 'e1',
        event_type: 'site.created',
        occurred_at: '2026-08-02T00:00:00.000Z',
        resource_type: 'site',
        resource_id: 's1',
        outcome: 'success',
      },
    ]);

    const result = await auditService.listActivity(USER_ID, { limit: 20 });

    expect(result.events).toEqual([
      {
        event_id: 'e1',
        event_type: 'site.created',
        occurred_at: '2026-08-02T00:00:00.000Z',
        resource_type: 'site',
        resource_id: 's1',
        outcome: 'success',
      },
    ]);
    expect(result.next_cursor).toBeNull();
    expect(auditRepository.listKeys).toHaveBeenCalledWith({ userId: USER_ID, limit: 20, startAfter: undefined });
  });

  it('defaults limit to 20 when omitted', async () => {
    auditRepository.listKeys.mockResolvedValue({ keys: [], nextCursorKey: null });
    auditRepository.fetchEvents.mockResolvedValue([]);

    await auditService.listActivity(USER_ID, {});

    expect(auditRepository.listKeys).toHaveBeenCalledWith({ userId: USER_ID, limit: 20, startAfter: undefined });
  });

  it('decodes a valid cursor into a startAfter key', async () => {
    const cursorKey = `${config.auditPrefix}/${USER_ID}/2026/08/02/1754136000000-abcdef12.json`;
    const cursor = encodeCursor(cursorKey, config.auditPrefix, USER_ID);
    auditRepository.listKeys.mockResolvedValue({ keys: [], nextCursorKey: null });
    auditRepository.fetchEvents.mockResolvedValue([]);

    await auditService.listActivity(USER_ID, { cursor });

    expect(auditRepository.listKeys).toHaveBeenCalledWith({ userId: USER_ID, limit: 20, startAfter: cursorKey });
  });

  it('throws AppError 400 on an invalid cursor', async () => {
    await expect(auditService.listActivity(USER_ID, { cursor: 'garbage' })).rejects.toThrow(AppError);
    await expect(auditService.listActivity(USER_ID, { cursor: 'garbage' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('encodes next_cursor from the repository nextCursorKey', async () => {
    const nextKey = `${config.auditPrefix}/${USER_ID}/2026/08/02/2000-abcdef12.json`;
    auditRepository.listKeys.mockResolvedValue({ keys: ['k1'], nextCursorKey: nextKey });
    auditRepository.fetchEvents.mockResolvedValue([{ event_id: 'e1' }]);

    const result = await auditService.listActivity(USER_ID, {});

    expect(result.next_cursor).not.toBeNull();
  });
});
