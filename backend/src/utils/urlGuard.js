const net = require('node:net');

// Kept in sync by convention with lambda/pinger/lib/ping.js's PRIVATE_V4_RANGES
// / isBlockedAddress - see the cross-reference comment there for why this is
// a deliberate duplicate rather than a shared module.
const PRIVATE_V4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

function isPrivateV4(address) {
  return PRIVATE_V4_RANGES.some((re) => re.test(address));
}

function isPrivateV6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('::ffff:127.')
  );
}

function isBlockedAddress(family, address) {
  return family === 4 ? isPrivateV4(address) : isPrivateV6(address);
}

const BLOCKED_HOSTNAMES = new Set(['localhost']);
const BLOCKED_HOSTNAME_SUFFIXES = ['.local'];

// Synchronous only - no DNS lookup. This is defence against the URL literally
// naming a private/loopback address (including decimal/octal/bracketed-v6
// evasions, which the WHATWG URL parser normalizes into a literal IP for us),
// not against DNS rebinding. The pinger Lambda re-resolves and re-checks
// immediately before every ping, which is the actual enforcement point - see
// assertUrlIsPingable in lambda/pinger/lib/ping.js.
function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;

  // net.isIP('[::1]') returns 0 (not recognized) - strip the brackets a
  // bracketed IPv6 literal carries in a URL's hostname before checking.
  const unbracketed = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;

  const family = net.isIP(unbracketed);
  if (family === 4 || family === 6) {
    return isBlockedAddress(family, unbracketed);
  }

  return false;
}

function assertSiteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { blocked: true, reason: 'unsupported_scheme' };
  }

  if (parsed.username || parsed.password) {
    return { blocked: true, reason: 'credentials_in_url' };
  }

  if (isBlockedHostname(parsed.hostname)) {
    return { blocked: true, reason: 'private_address' };
  }

  return { blocked: false };
}

module.exports = { isBlockedAddress, isBlockedHostname, assertSiteUrl };
