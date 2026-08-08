jest.mock('../lib/ping');
jest.mock('../lib/sites');
jest.mock('../lib/history');
jest.mock('../lib/metrics');
jest.mock('../lib/events');

const { pingUrl } = require('../lib/ping');
const { scanDueSites, writeSiteStatus } = require('../lib/sites');
const { writeHistoryRecord } = require('../lib/history');
const { emitSiteDownMetric } = require('../lib/metrics');
const { publishStatusChanges } = require('../lib/events');
const { handler } = require('../index');

describe('handler', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      SITES_TABLE: 'pulsemonitor-dev-sites',
      HISTORY_BUCKET: 'pulsemonitor-dev-history',
    };
    jest.clearAllMocks();
    writeHistoryRecord.mockResolvedValue('some/key.json');
    emitSiteDownMetric.mockReturnValue(undefined);
    publishStatusChanges.mockResolvedValue(undefined);
    writeSiteStatus.mockResolvedValue({ statusChanged: false, previousStatus: 'up', status: 'up' });
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('passes the scanned site.status through as previousStatus, not undefined', async () => {
    scanDueSites.mockResolvedValue([
      { user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'down' },
    ]);
    pingUrl.mockResolvedValue({ status: 'up', status_code: 200, latency_ms: 50, error_type: null, error_message: null });

    await handler({}, {});

    expect(writeSiteStatus).toHaveBeenCalledTimes(1);
    const call = writeSiteStatus.mock.calls[0][2];
    expect(call.previousStatus).toBe('down');
  });

  it('passes undefined previousStatus only when the site has never been checked', async () => {
    scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com' }]);
    pingUrl.mockResolvedValue({ status: 'up', status_code: 200, latency_ms: 50, error_type: null, error_message: null });

    await handler({}, {});

    const call = writeSiteStatus.mock.calls[0][2];
    expect(call.previousStatus).toBeUndefined();
  });

  describe('status-change publishing', () => {
    it('includes a site in the publish batch when its status changed', async () => {
      scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'up' }]);
      pingUrl.mockResolvedValue({ status: 'down', status_code: null, latency_ms: null, error_type: 'timeout', error_message: 'timed out' });
      writeSiteStatus.mockResolvedValue({ statusChanged: true, previousStatus: 'up', status: 'down' });

      await handler({}, {});

      expect(publishStatusChanges).toHaveBeenCalledTimes(1);
      const { changes } = publishStatusChanges.mock.calls[0][1];
      expect(changes).toHaveLength(1);
      expect(changes[0].transition).toEqual({ statusChanged: true, previousStatus: 'up', status: 'down' });
      expect(changes[0].site.site_id).toBe('s1');
    });

    it('excludes a site from the publish batch when its status did not change', async () => {
      scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'up' }]);
      pingUrl.mockResolvedValue({ status: 'up', status_code: 200, latency_ms: 50, error_type: null, error_message: null });
      writeSiteStatus.mockResolvedValue({ statusChanged: false, previousStatus: 'up', status: 'up' });

      await handler({}, {});

      const { changes } = publishStatusChanges.mock.calls[0][1];
      expect(changes).toHaveLength(0);
    });

    it('excludes a site that was deleted mid-cycle (ConditionalCheckFailedException) from the publish batch', async () => {
      scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'up' }]);
      pingUrl.mockResolvedValue({ status: 'down', status_code: null, latency_ms: null, error_type: 'timeout', error_message: 'timed out' });
      const err = new Error('conditional check failed');
      err.name = 'ConditionalCheckFailedException';
      writeSiteStatus.mockRejectedValue(err);

      const outcome = await handler({}, {});

      expect(outcome.results[0]).toEqual({ siteId: 's1', skipped: true });
      const { changes } = publishStatusChanges.mock.calls[0][1];
      expect(changes).toHaveLength(0);
    });

    it('does not publish when EVENT_BUS_NAME is unset', async () => {
      scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'up' }]);
      pingUrl.mockResolvedValue({ status: 'down', status_code: null, latency_ms: null, error_type: 'timeout', error_message: 'timed out' });
      writeSiteStatus.mockResolvedValue({ statusChanged: true, previousStatus: 'up', status: 'down' });

      await handler({}, {});

      const { busName } = publishStatusChanges.mock.calls[0][1];
      expect(busName).toBeUndefined();
    });

    it('still resolves { checked: 1 } when publishStatusChanges rejects', async () => {
      scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'up' }]);
      pingUrl.mockResolvedValue({ status: 'down', status_code: null, latency_ms: null, error_type: 'timeout', error_message: 'timed out' });
      writeSiteStatus.mockResolvedValue({ statusChanged: true, previousStatus: 'up', status: 'down' });
      publishStatusChanges.mockRejectedValue(new Error('unexpected'));

      await expect(handler({}, {})).resolves.toMatchObject({ checked: 1 });
    });
  });
});
