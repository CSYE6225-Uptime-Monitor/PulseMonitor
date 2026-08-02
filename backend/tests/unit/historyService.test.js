jest.mock('../../src/repositories/siteRepository');
jest.mock('../../src/repositories/historyRepository');

const siteRepository = require('../../src/repositories/siteRepository');
const historyRepository = require('../../src/repositories/historyRepository');
const historyService = require('../../src/services/historyService');
const { boundaryKey } = require('../../src/utils/historyKeys');
const config = require('../../src/config/env');

describe('historyService.getHistory', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('throws AppError 404 when the site does not exist', async () => {
    siteRepository.findById.mockResolvedValue(null);
    await expect(historyService.getHistory('u1', 'missing', {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws AppError 404 when the site belongs to another user', async () => {
    // Ownership is enforced by always querying with the session's own
    // user_id, so "belongs to another user" and "unknown" are indistinguishable.
    siteRepository.findById.mockResolvedValue(null);
    await expect(historyService.getHistory('u1', 's1', {})).rejects.toMatchObject({ statusCode: 404 });
    expect(siteRepository.findById).toHaveBeenCalledWith('u1', 's1');
  });

  it('defaults `to` to now and `from` to 24 hours before `to`', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });
    historyRepository.listKeysInRange.mockResolvedValue({ keys: [], nextCursorKey: null });
    historyRepository.fetchRecords.mockResolvedValue([]);

    const before = Date.now();
    await historyService.getHistory('u1', 's1', {});
    const after = Date.now();

    const call = historyRepository.listKeysInRange.mock.calls[0][0];
    expect(call.toMs).toBeGreaterThanOrEqual(before);
    expect(call.toMs).toBeLessThanOrEqual(after);

    const expectedFromBoundary = boundaryKey(config.historyPrefix, 'u1', 's1', call.toMs - 24 * 60 * 60 * 1000);
    expect(call.startAfter).toBe(expectedFromBoundary);
  });

  it('throws AppError 400 when from is not before to', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });

    await expect(
      historyService.getHistory('u1', 's1', { from: '2026-08-02T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('scopes the S3 prefix to the session user_id, not any client-supplied value', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });
    historyRepository.listKeysInRange.mockResolvedValue({ keys: [], nextCursorKey: null });
    historyRepository.fetchRecords.mockResolvedValue([]);

    await historyService.getHistory('u1', 's1', {});

    const call = historyRepository.listKeysInRange.mock.calls[0][0];
    expect(call.userId).toBe('u1');
    expect(call.siteId).toBe('s1');
  });

  it('returns an empty record list rather than throwing when the site has no history', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });
    historyRepository.listKeysInRange.mockResolvedValue({ keys: [], nextCursorKey: null });
    historyRepository.fetchRecords.mockResolvedValue([]);

    const result = await historyService.getHistory('u1', 's1', {});

    expect(result).toEqual({ records: [], next_cursor: null });
  });

  it('throws AppError 400 for a malformed cursor', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });

    await expect(historyService.getHistory('u1', 's1', { cursor: 'not-valid!!!' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('builds a non-null next_cursor from the repository nextCursorKey', async () => {
    siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });
    const key = `${config.historyPrefix}/u1/s1/2026/08/02/1785679503123-abcdef12.json`;
    historyRepository.listKeysInRange.mockResolvedValue({ keys: [key], nextCursorKey: key });
    historyRepository.fetchRecords.mockResolvedValue([{ check_id: 'c1' }]);

    const result = await historyService.getHistory('u1', 's1', {});

    expect(result.next_cursor).toEqual(expect.any(String));
    expect(result.records).toEqual([{ check_id: 'c1' }]);
  });
});
