describe('env config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('exposes the sites table name', () => {
    const config = require('../../src/config/env');
    expect(config.sitesTable).toBe('pulsemonitor-test-sites');
  });

  it('throws when SITES_TABLE is missing', () => {
    delete process.env.SITES_TABLE;
    expect(() => require('../../src/config/env')).toThrow(/SITES_TABLE/);
  });

  it('throws when HISTORY_BUCKET is missing', () => {
    delete process.env.HISTORY_BUCKET;
    expect(() => require('../../src/config/env')).toThrow(/HISTORY_BUCKET/);
  });

  it('exposes historyBucket', () => {
    const config = require('../../src/config/env');
    expect(config.historyBucket).toBe('pulsemonitor-test-history');
  });

  it('defaults historyPrefix to "sites" when HISTORY_PREFIX is unset', () => {
    delete process.env.HISTORY_PREFIX;
    const config = require('../../src/config/env');
    expect(config.historyPrefix).toBe('sites');
  });

  it('honors an explicit HISTORY_PREFIX', () => {
    process.env.HISTORY_PREFIX = 'custom-prefix';
    const config = require('../../src/config/env');
    expect(config.historyPrefix).toBe('custom-prefix');
  });

  it('exposes s3Endpoint as undefined when S3_ENDPOINT is unset', () => {
    delete process.env.S3_ENDPOINT;
    const config = require('../../src/config/env');
    expect(config.s3Endpoint).toBeUndefined();
  });

  it('exposes s3Endpoint when S3_ENDPOINT is set', () => {
    process.env.S3_ENDPOINT = 'http://localhost:4566';
    const config = require('../../src/config/env');
    expect(config.s3Endpoint).toBe('http://localhost:4566');
  });
});
