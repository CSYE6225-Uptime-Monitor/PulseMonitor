jest.mock('../../src/repositories/siteRepository');

const siteRepository = require('../../src/repositories/siteRepository');
const siteService = require('../../src/services/siteService');

describe('siteService', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createSite', () => {
    it('generates a uuid site_id and stamps created_at and updated_at', async () => {
      siteRepository.create.mockImplementation(async (site) => site);

      const result = await siteService.createSite('u1', {
        url: 'https://example.com',
        name: 'My Site',
        check_frequency_minutes: 5,
        enabled: true,
      });

      expect(result.site_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
      expect(result.created_at).toEqual(expect.any(String));
      expect(result.updated_at).toEqual(expect.any(String));
    });

    it('persists the caller user_id', async () => {
      siteRepository.create.mockImplementation(async (site) => site);

      await siteService.createSite('u1', { url: 'https://example.com', name: 'x', check_frequency_minutes: 5, enabled: true });

      expect(siteRepository.create.mock.calls[0][0].user_id).toBe('u1');
    });

    it('returns the site shape with an unknown status block', async () => {
      siteRepository.create.mockImplementation(async (site) => site);

      const result = await siteService.createSite('u1', {
        url: 'https://example.com',
        name: 'x',
        check_frequency_minutes: 5,
        enabled: true,
      });

      expect(result.status).toEqual({
        status: 'unknown',
        status_code: null,
        latency_ms: null,
        checked_at: null,
        error_type: null,
        error_message: null,
        consecutive_failures: 0,
        last_status_change_at: null,
      });
    });
  });

  describe('listSites', () => {
    it('maps repository items through the site shape', async () => {
      siteRepository.listByUser.mockResolvedValue([
        { user_id: 'u1', site_id: 's1', url: 'https://example.com', name: 'x', check_frequency_minutes: 5, enabled: true },
      ]);

      const result = await siteService.listSites('u1');

      expect(result).toHaveLength(1);
      expect(result[0].site_id).toBe('s1');
      expect(result[0].status.status).toBe('unknown');
      expect(result[0]).not.toHaveProperty('user_id');
    });

    it('returns an empty array when the user has no sites', async () => {
      siteRepository.listByUser.mockResolvedValue([]);
      const result = await siteService.listSites('u1');
      expect(result).toEqual([]);
    });
  });

  describe('getSite', () => {
    it('passes the session user_id as the partition key', async () => {
      siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1', url: 'https://example.com', name: 'x' });

      await siteService.getSite('u1', 's1');

      expect(siteRepository.findById).toHaveBeenCalledWith('u1', 's1');
    });

    it('throws 404 when the item is missing (unknown or other-user site)', async () => {
      siteRepository.findById.mockResolvedValue(null);
      await expect(siteService.getSite('u1', 'missing')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateSite', () => {
    it('forwards only allowlisted fields to the repository', async () => {
      siteRepository.update.mockResolvedValue({ user_id: 'u1', site_id: 's1', name: 'new-name' });

      await siteService.updateSite('u1', 's1', { name: 'new-name', status: 'up' });

      expect(siteRepository.update).toHaveBeenCalledWith('u1', 's1', { name: 'new-name' });
    });

    it('propagates the repository 404', async () => {
      const AppError = require('../../src/errors/AppError');
      siteRepository.update.mockRejectedValue(new AppError(404, 'Site not found.'));

      await expect(siteService.updateSite('u1', 's1', { name: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteSite', () => {
    it('removes using the caller user_id', async () => {
      siteRepository.remove.mockResolvedValue(undefined);
      await siteService.deleteSite('u1', 's1');
      expect(siteRepository.remove).toHaveBeenCalledWith('u1', 's1');
    });
  });

  describe('getSiteStatus', () => {
    it('returns status "unknown" with null fields and zero failures for a never-checked site', async () => {
      siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1', url: 'https://example.com', name: 'x' });

      const result = await siteService.getSiteStatus('u1', 's1');

      expect(result).toEqual({
        site_id: 's1',
        status: 'unknown',
        status_code: null,
        latency_ms: null,
        checked_at: null,
        error_type: null,
        error_message: null,
        consecutive_failures: 0,
        last_status_change_at: null,
      });
    });

    it('returns the pinger-written values once checked', async () => {
      siteRepository.findById.mockResolvedValue({
        user_id: 'u1',
        site_id: 's1',
        status: 'up',
        status_code: 200,
        latency_ms: 143,
        checked_at: '2026-08-02T14:05:03.123Z',
        error_type: null,
        error_message: null,
        consecutive_failures: 0,
        last_status_change_at: '2026-08-02T14:05:03.123Z',
      });

      const result = await siteService.getSiteStatus('u1', 's1');

      expect(result.status).toBe('up');
      expect(result.status_code).toBe(200);
      expect(result.latency_ms).toBe(143);
    });

    it('throws 404 for an unknown or other-user site', async () => {
      siteRepository.findById.mockResolvedValue(null);
      await expect(siteService.getSiteStatus('u1', 'missing')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns exactly the documented keys', async () => {
      siteRepository.findById.mockResolvedValue({ user_id: 'u1', site_id: 's1' });
      const result = await siteService.getSiteStatus('u1', 's1');

      expect(Object.keys(result).sort()).toEqual(
        [
          'site_id',
          'status',
          'status_code',
          'latency_ms',
          'checked_at',
          'error_type',
          'error_message',
          'consecutive_failures',
          'last_status_change_at',
        ].sort()
      );
    });
  });
});
