const dns = require('node:dns');

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
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('::ffff:127.');
}

function isBlockedAddress(family, address) {
  return family === 4 ? isPrivateV4(address) : isPrivateV6(address);
}

// SSRF guard: only http(s) schemes, and the resolved host must not point at
// a private/loopback/link-local address. Mirrors the URL validation rule the
// sites API (PM-15) enforces at write time - this is defence in depth against
// DNS rebinding between validation and the actual ping.
async function assertUrlIsPingable(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { blocked: true, reason: 'unsupported_scheme' };
  }

  try {
    const { address, family } = await dns.promises.lookup(parsed.hostname);
    if (isBlockedAddress(family, address)) {
      return { blocked: true, reason: 'private_address' };
    }
  } catch {
    return { blocked: true, reason: 'dns_error' };
  }

  return { blocked: false };
}

function classifyError(err) {
  // undici's fetch wraps DNS/connection failures in a generic
  // `TypeError: fetch failed` and puts the real reason on err.cause - check
  // both the error and its cause for a recognizable code/name.
  const cause = err.cause || {};
  const name = err.name || cause.name;
  const code = err.code || cause.code;
  const message = `${err.message || ''} ${cause.message || ''}`;

  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_error';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (/certificate|SSL|TLS/i.test(message)) return 'tls_error';
  return 'unknown';
}

// Pings a single URL and returns a normalized result. Never throws - all
// failure modes resolve to { status: 'down', error_type, error_message }.
// `up` iff 200 <= status_code < 400 - this boundary is a product decision the
// frontend and history API depend on; do not change it without updating both.
async function pingUrl(url, { timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const guard = await assertUrlIsPingable(url);
  if (guard.blocked) {
    return {
      status: 'down',
      status_code: null,
      latency_ms: null,
      error_type: 'blocked_url',
      error_message: `URL rejected by SSRF guard: ${guard.reason}`,
    };
  }

  const startedAt = performance.now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'PulseMonitor/1.0 (+https://pulsemonitor.online)' },
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    res.body?.cancel?.();

    const statusCode = res.status;
    const up = statusCode >= 200 && statusCode < 400;

    return {
      status: up ? 'up' : 'down',
      status_code: statusCode,
      latency_ms: latencyMs,
      error_type: up ? null : 'http_error',
      error_message: up ? null : `Upstream responded with HTTP ${statusCode}`,
    };
  } catch (err) {
    const detail = err.cause?.message ? `${err.message}: ${err.cause.message}` : err.message || String(err);
    return {
      status: 'down',
      status_code: null,
      latency_ms: null,
      error_type: classifyError(err),
      error_message: detail.slice(0, 256),
    };
  }
}

module.exports = { pingUrl, assertUrlIsPingable, isBlockedAddress };
