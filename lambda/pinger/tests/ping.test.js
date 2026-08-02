jest.mock('node:dns', () => ({
  promises: { lookup: jest.fn() },
}));

const dns = require('node:dns');
const { pingUrl, isBlockedAddress } = require('../lib/ping');

function fakeFetch(status, { delayMs = 0 } = {}) {
  return jest.fn(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return { status, body: { cancel: jest.fn() } };
  });
}

describe('isBlockedAddress', () => {
  it('blocks RFC1918 v4 ranges', () => {
    expect(isBlockedAddress(4, '10.0.0.5')).toBe(true);
    expect(isBlockedAddress(4, '192.168.1.1')).toBe(true);
    expect(isBlockedAddress(4, '172.16.0.1')).toBe(true);
    expect(isBlockedAddress(4, '169.254.169.254')).toBe(true); // IMDS
    expect(isBlockedAddress(4, '127.0.0.1')).toBe(true);
  });

  it('allows public v4 addresses', () => {
    expect(isBlockedAddress(4, '93.184.216.34')).toBe(false);
  });

  it('blocks v6 loopback and unique-local', () => {
    expect(isBlockedAddress(6, '::1')).toBe(true);
    expect(isBlockedAddress(6, 'fc00::1')).toBe(true);
  });
});

describe('pingUrl', () => {
  beforeEach(() => {
    dns.promises.lookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
  });

  it('classifies 200 as up', async () => {
    const result = await pingUrl('https://example.com', { fetchImpl: fakeFetch(200) });
    expect(result.status).toBe('up');
    expect(result.status_code).toBe(200);
    expect(result.error_type).toBeNull();
  });

  it('classifies 399 as up (boundary)', async () => {
    const result = await pingUrl('https://example.com', { fetchImpl: fakeFetch(399) });
    expect(result.status).toBe('up');
  });

  it('classifies 400 as down (boundary)', async () => {
    const result = await pingUrl('https://example.com', { fetchImpl: fakeFetch(400) });
    expect(result.status).toBe('down');
    expect(result.error_type).toBe('http_error');
  });

  it('classifies 500 as down', async () => {
    const result = await pingUrl('https://example.com', { fetchImpl: fakeFetch(500) });
    expect(result.status).toBe('down');
  });

  it('classifies a timeout', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      throw err;
    });
    const result = await pingUrl('https://example.com', { fetchImpl, timeoutMs: 10 });
    expect(result.status).toBe('down');
    expect(result.error_type).toBe('timeout');
  });

  it('classifies a DNS failure raised by fetch itself', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('getaddrinfo ENOTFOUND nosuchhost.invalid');
      err.code = 'ENOTFOUND';
      throw err;
    });
    const result = await pingUrl('https://nosuchhost.invalid', { fetchImpl });
    expect(result.status).toBe('down');
    expect(result.error_type).toBe('dns_error');
  });

  it('blocks a private-IP URL without calling fetch', async () => {
    dns.promises.lookup.mockResolvedValue({ address: '10.0.0.5', family: 4 });
    const fetchImpl = jest.fn();
    const result = await pingUrl('http://10.0.0.5/', { fetchImpl });
    expect(result.status).toBe('down');
    expect(result.error_type).toBe('blocked_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) schemes without calling fetch', async () => {
    const fetchImpl = jest.fn();
    const result = await pingUrl('ftp://example.com/', { fetchImpl });
    expect(result.status).toBe('down');
    expect(result.error_type).toBe('blocked_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
