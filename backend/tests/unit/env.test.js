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

  it('does not throw when USER_DATA_BUCKET / AUDIT_BUCKET are unset', () => {
    delete process.env.USER_DATA_BUCKET;
    delete process.env.AUDIT_BUCKET;
    expect(() => require('../../src/config/env')).not.toThrow();
  });

  it('exposes userDataBucket as undefined when USER_DATA_BUCKET is unset', () => {
    delete process.env.USER_DATA_BUCKET;
    const config = require('../../src/config/env');
    expect(config.userDataBucket).toBeUndefined();
  });

  it('exposes userDataBucket when USER_DATA_BUCKET is set', () => {
    process.env.USER_DATA_BUCKET = 'pulsemonitor-test-user-data';
    const config = require('../../src/config/env');
    expect(config.userDataBucket).toBe('pulsemonitor-test-user-data');
  });

  it('exposes auditBucket as undefined when AUDIT_BUCKET is unset', () => {
    delete process.env.AUDIT_BUCKET;
    const config = require('../../src/config/env');
    expect(config.auditBucket).toBeUndefined();
  });

  it('exposes auditBucket when AUDIT_BUCKET is set', () => {
    process.env.AUDIT_BUCKET = 'pulsemonitor-test-audit-logs';
    const config = require('../../src/config/env');
    expect(config.auditBucket).toBe('pulsemonitor-test-audit-logs');
  });

  it('defaults exportPrefix to "exports" when EXPORT_PREFIX is unset', () => {
    delete process.env.EXPORT_PREFIX;
    const config = require('../../src/config/env');
    expect(config.exportPrefix).toBe('exports');
  });

  it('honors an explicit EXPORT_PREFIX', () => {
    process.env.EXPORT_PREFIX = 'custom-exports';
    const config = require('../../src/config/env');
    expect(config.exportPrefix).toBe('custom-exports');
  });

  it('defaults auditPrefix to "audit" when AUDIT_PREFIX is unset', () => {
    delete process.env.AUDIT_PREFIX;
    const config = require('../../src/config/env');
    expect(config.auditPrefix).toBe('audit');
  });

  it('honors an explicit AUDIT_PREFIX', () => {
    process.env.AUDIT_PREFIX = 'custom-audit';
    const config = require('../../src/config/env');
    expect(config.auditPrefix).toBe('custom-audit');
  });

  it('defaults exportUrlTtlSeconds to 300 when EXPORT_URL_TTL_SECONDS is unset', () => {
    delete process.env.EXPORT_URL_TTL_SECONDS;
    const config = require('../../src/config/env');
    expect(config.exportUrlTtlSeconds).toBe(300);
  });

  it('honors an explicit EXPORT_URL_TTL_SECONDS', () => {
    process.env.EXPORT_URL_TTL_SECONDS = '120';
    const config = require('../../src/config/env');
    expect(config.exportUrlTtlSeconds).toBe(120);
  });
});
