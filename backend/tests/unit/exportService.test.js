jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/siteRepository');
jest.mock('../../src/repositories/historyRepository');
jest.mock('../../src/repositories/exportRepository');

const userRepository = require('../../src/repositories/userRepository');
const siteRepository = require('../../src/repositories/siteRepository');
const historyRepository = require('../../src/repositories/historyRepository');
const exportRepository = require('../../src/repositories/exportRepository');
const exportService = require('../../src/services/exportService');
const config = require('../../src/config/env');

const USER_ID = 'u1';
const EMAIL = 'jane@example.com';

function fakeUser() {
  return {
    email: EMAIL,
    user_id: USER_ID,
    password_hash: 'super-secret-bcrypt-hash',
    first_name: 'Jane',
    last_name: 'Doe',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function fakeSite(id) {
  return {
    user_id: USER_ID,
    site_id: id,
    url: `https://example${id}.com`,
    name: `Site ${id}`,
    check_frequency_minutes: 5,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('exportService.createExport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findByEmail.mockResolvedValue(fakeUser());
    siteRepository.listByUser.mockResolvedValue([]);
    historyRepository.listKeysInRange.mockResolvedValue({ keys: [], nextCursorKey: null });
    historyRepository.fetchRecords.mockResolvedValue([]);
    exportRepository.listExports.mockResolvedValue([]);
    exportRepository.putExport.mockResolvedValue(undefined);
  });

  it('throws 503 when the user-data bucket is not configured', async () => {
    const original = config.userDataBucket;
    config.userDataBucket = undefined;

    await expect(exportService.createExport(USER_ID, EMAIL)).rejects.toMatchObject({ statusCode: 503 });

    config.userDataBucket = original;
  });

  it('throws 429 when the newest export is younger than the throttle interval', async () => {
    const recentMs = Date.now() - 1000;
    exportRepository.listExports.mockResolvedValue([
      { export_id: `${recentMs}-aaaaaaaa`, created_at: new Date(recentMs).toISOString(), size_bytes: 10 },
    ]);

    await expect(exportService.createExport(USER_ID, EMAIL)).rejects.toMatchObject({ statusCode: 429 });
    expect(exportRepository.putExport).not.toHaveBeenCalled();
  });

  it('allows an export when the newest export is older than the throttle interval', async () => {
    const oldMs = Date.now() - 120_000;
    exportRepository.listExports.mockResolvedValue([
      { export_id: `${oldMs}-aaaaaaaa`, created_at: new Date(oldMs).toISOString(), size_bytes: 10 },
    ]);

    await expect(exportService.createExport(USER_ID, EMAIL)).resolves.toMatchObject({ status: 'ready' });
  });

  it('builds the profile from the safe user projection, never leaking password_hash', async () => {
    await exportService.createExport(USER_ID, EMAIL);

    const bundle = exportRepository.putExport.mock.calls[0][3];
    expect(JSON.stringify(bundle)).not.toContain('password_hash');
    expect(JSON.stringify(bundle)).not.toContain('super-secret-bcrypt-hash');
    expect(bundle.profile).toEqual({
      email: EMAIL,
      user_id: USER_ID,
      first_name: 'Jane',
      last_name: 'Doe',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('includes all sites when under the cap and sets sites_truncated false', async () => {
    siteRepository.listByUser.mockResolvedValue([fakeSite('s1'), fakeSite('s2')]);

    await exportService.createExport(USER_ID, EMAIL);

    const bundle = exportRepository.putExport.mock.calls[0][3];
    expect(bundle.sites).toHaveLength(2);
    expect(bundle.sites_truncated).toBe(false);
  });

  it('caps sites at EXPORT_MAX_SITES and sets sites_truncated true', async () => {
    siteRepository.listByUser.mockResolvedValue(Array.from({ length: 30 }, (_, i) => fakeSite(`s${i}`)));

    await exportService.createExport(USER_ID, EMAIL);

    const bundle = exportRepository.putExport.mock.calls[0][3];
    expect(bundle.sites).toHaveLength(25);
    expect(bundle.sites_truncated).toBe(true);
  });

  it('fetches recent history per site and keys it by site_id', async () => {
    siteRepository.listByUser.mockResolvedValue([fakeSite('s1')]);
    historyRepository.listKeysInRange.mockResolvedValue({ keys: ['k1'], nextCursorKey: null });
    historyRepository.fetchRecords.mockResolvedValue([{ check_id: 'c1', status: 'up' }]);

    await exportService.createExport(USER_ID, EMAIL);

    const bundle = exportRepository.putExport.mock.calls[0][3];
    expect(bundle.history.s1).toEqual([{ check_id: 'c1', status: 'up' }]);
    expect(historyRepository.listKeysInRange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, siteId: 's1', limit: 50 })
    );
  });

  it('sets history_truncated true when any site has more history than the per-site cap', async () => {
    siteRepository.listByUser.mockResolvedValue([fakeSite('s1')]);
    historyRepository.listKeysInRange.mockResolvedValue({ keys: ['k1'], nextCursorKey: 'some-key' });

    await exportService.createExport(USER_ID, EMAIL);

    const bundle = exportRepository.putExport.mock.calls[0][3];
    expect(bundle.history_truncated).toBe(true);
  });

  it('returns export_id, status ready, created_at, and size_bytes', async () => {
    const result = await exportService.createExport(USER_ID, EMAIL);

    expect(result.status).toBe('ready');
    expect(typeof result.export_id).toBe('string');
    expect(result.export_id).toMatch(/^\d{13}-[0-9a-f]{8}$/);
    expect(() => new Date(result.created_at).toISOString()).not.toThrow();
    expect(typeof result.size_bytes).toBe('number');
  });
});

describe('exportService.listExports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws 503 when the user-data bucket is not configured', async () => {
    const original = config.userDataBucket;
    config.userDataBucket = undefined;

    await expect(exportService.listExports(USER_ID)).rejects.toMatchObject({ statusCode: 503 });

    config.userDataBucket = original;
  });

  it('maps repository entries to the public shape with status ready', async () => {
    exportRepository.listExports.mockResolvedValue([
      { export_id: '1700000000000-aaaaaaaa', created_at: '2026-01-01T00:00:00.000Z', size_bytes: 100 },
    ]);

    const result = await exportService.listExports(USER_ID);

    expect(result).toEqual([
      { export_id: '1700000000000-aaaaaaaa', status: 'ready', created_at: '2026-01-01T00:00:00.000Z', size_bytes: 100 },
    ]);
  });
});

describe('exportService.getDownloadUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws 503 when the user-data bucket is not configured', async () => {
    const original = config.userDataBucket;
    config.userDataBucket = undefined;

    await expect(exportService.getDownloadUrl(USER_ID, '1700000000000-aaaaaaaa')).rejects.toMatchObject({
      statusCode: 503,
    });

    config.userDataBucket = original;
  });

  it('throws 404 for an id absent from the caller listing, without presigning', async () => {
    exportRepository.listExports.mockResolvedValue([]);

    await expect(exportService.getDownloadUrl(USER_ID, '1700000000000-aaaaaaaa')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(exportRepository.presignDownload).not.toHaveBeenCalled();
  });

  it('presigns and returns url, expires_at, filename for a matching id', async () => {
    exportRepository.listExports.mockResolvedValue([
      { export_id: '1700000000000-aaaaaaaa', created_at: '2026-01-01T00:00:00.000Z', size_bytes: 100 },
    ]);
    exportRepository.presignDownload.mockResolvedValue('https://s3.example.com/signed');

    const result = await exportService.getDownloadUrl(USER_ID, '1700000000000-aaaaaaaa');

    expect(result.url).toBe('https://s3.example.com/signed');
    expect(result.filename).toMatch(/^pulsemonitor-export-.*\.json$/);
    expect(() => new Date(result.expires_at).toISOString()).not.toThrow();
    expect(exportRepository.presignDownload).toHaveBeenCalledWith(
      USER_ID,
      '1700000000000-aaaaaaaa',
      expect.objectContaining({ ttlSeconds: config.exportUrlTtlSeconds })
    );
  });
});
