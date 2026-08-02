const { isBlockedAddress, isBlockedHostname, assertSiteUrl } = require('../../src/utils/urlGuard');

describe('isBlockedAddress', () => {
  // Mirrors the exact vectors from lambda/pinger/tests/ping.test.js so drift
  // between the two guards shows up as a test failure.
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

describe('isBlockedHostname', () => {
  it('blocks literal private v4 hosts', () => {
    expect(isBlockedHostname('10.0.0.1')).toBe(true);
    expect(isBlockedHostname('192.168.1.1')).toBe(true);
    expect(isBlockedHostname('172.16.0.1')).toBe(true);
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('0.0.0.0')).toBe(true);
  });

  it('blocks bracketed IPv6 loopback and unique-local literals', () => {
    expect(isBlockedHostname('[::1]')).toBe(true);
    expect(isBlockedHostname('[fc00::1]')).toBe(true);
  });

  it('blocks localhost and .local hostnames', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('LOCALHOST')).toBe(true);
    expect(isBlockedHostname('my-printer.local')).toBe(true);
  });

  it('allows a public hostname', () => {
    expect(isBlockedHostname('example.com')).toBe(false);
  });

  it('allows a public literal v4 address', () => {
    expect(isBlockedHostname('93.184.216.34')).toBe(false);
  });
});

describe('assertSiteUrl', () => {
  it('blocks non-http(s) schemes', () => {
    expect(assertSiteUrl('javascript:alert(1)')).toEqual({ blocked: true, reason: 'unsupported_scheme' });
    expect(assertSiteUrl('ftp://example.com')).toEqual({ blocked: true, reason: 'unsupported_scheme' });
    expect(assertSiteUrl('file:///etc/passwd')).toEqual({ blocked: true, reason: 'unsupported_scheme' });
    expect(assertSiteUrl('data:text/html,x')).toEqual({ blocked: true, reason: 'unsupported_scheme' });
  });

  it('blocks unparseable input', () => {
    expect(assertSiteUrl('not a url')).toEqual({ blocked: true, reason: 'invalid_url' });
    expect(assertSiteUrl('')).toEqual({ blocked: true, reason: 'invalid_url' });
  });

  it('blocks literal private v4 hosts', () => {
    expect(assertSiteUrl('http://10.0.0.1/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://192.168.1.1/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://172.16.0.1/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://127.0.0.1/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://169.254.169.254/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://0.0.0.0/')).toEqual({ blocked: true, reason: 'private_address' });
  });

  it('blocks decimal and octal IPv4 evasions normalized by the URL parser', () => {
    expect(assertSiteUrl('http://2130706433/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://0177.0.0.1/')).toEqual({ blocked: true, reason: 'private_address' });
  });

  it('blocks bracketed IPv6 loopback and unique-local', () => {
    expect(assertSiteUrl('http://[::1]/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://[fc00::1]/')).toEqual({ blocked: true, reason: 'private_address' });
  });

  it('blocks localhost and .local hostnames', () => {
    expect(assertSiteUrl('http://localhost/')).toEqual({ blocked: true, reason: 'private_address' });
    expect(assertSiteUrl('http://printer.local/')).toEqual({ blocked: true, reason: 'private_address' });
  });

  it('blocks URLs carrying credentials', () => {
    expect(assertSiteUrl('http://user:pass@example.com/')).toEqual({ blocked: true, reason: 'credentials_in_url' });
  });

  it('allows public http and https URLs', () => {
    expect(assertSiteUrl('https://example.com/health')).toEqual({ blocked: false });
    expect(assertSiteUrl('http://example.com:8080/x')).toEqual({ blocked: false });
  });
});
