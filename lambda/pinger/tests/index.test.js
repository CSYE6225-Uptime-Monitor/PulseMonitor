jest.mock('../lib/ping');
jest.mock('../lib/sites');
jest.mock('../lib/history');
jest.mock('../lib/metrics');

const { pingUrl } = require('../lib/ping');
const { scanDueSites, writeSiteStatus } = require('../lib/sites');
const { writeHistoryRecord } = require('../lib/history');
const { emitSiteDownMetric } = require('../lib/metrics');
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
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('passes the scanned site.status through as previousStatus, not undefined', async () => {
    scanDueSites.mockResolvedValue([
      { user_id: 'u1', site_id: 's1', url: 'https://a.com', status: 'down' },
    ]);
    pingUrl.mockResolvedValue({ status: 'up', status_code: 200, latency_ms: 50, error_type: null, error_message: null });
    writeSiteStatus.mockResolvedValue({});

    await handler({}, {});

    expect(writeSiteStatus).toHaveBeenCalledTimes(1);
    const call = writeSiteStatus.mock.calls[0][2];
    expect(call.previousStatus).toBe('down');
  });

  it('passes undefined previousStatus only when the site has never been checked', async () => {
    scanDueSites.mockResolvedValue([{ user_id: 'u1', site_id: 's1', url: 'https://a.com' }]);
    pingUrl.mockResolvedValue({ status: 'up', status_code: 200, latency_ms: 50, error_type: null, error_message: null });
    writeSiteStatus.mockResolvedValue({});

    await handler({}, {});

    const call = writeSiteStatus.mock.calls[0][2];
    expect(call.previousStatus).toBeUndefined();
  });
});
