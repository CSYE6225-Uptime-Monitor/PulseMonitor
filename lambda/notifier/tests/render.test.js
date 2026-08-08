const { renderDownEmail, renderRecoveredEmail } = require('../lib/render');

function downDetail(overrides = {}) {
  return {
    site_id: 's1',
    user_id: 'u1',
    url: 'https://example.com/health',
    name: 'Example Site',
    status: 'down',
    previous_status: 'up',
    previous_status_change_at: null,
    status_code: null,
    latency_ms: null,
    error_type: 'timeout',
    error_message: 'timed out after 10000ms',
    checked_at: '2026-08-02T14:05:00.000Z',
    ...overrides,
  };
}

function recoveredDetail(overrides = {}) {
  return {
    site_id: 's1',
    user_id: 'u1',
    url: 'https://example.com/health',
    name: 'Example Site',
    status: 'up',
    previous_status: 'down',
    previous_status_change_at: '2026-08-02T13:51:00.000Z',
    status_code: 200,
    latency_ms: 120,
    error_type: null,
    error_message: null,
    checked_at: '2026-08-02T14:05:00.000Z',
    ...overrides,
  };
}

describe('renderDownEmail', () => {
  it('builds a subject naming the site and status', () => {
    const email = renderDownEmail(downDetail(), { environment: 'prod' });
    expect(email.subject).toContain('DOWN');
    expect(email.subject).toContain('Example Site');
    expect(email.subject).toContain('example.com');
  });

  it('prefixes the subject with [dev] outside prod', () => {
    const email = renderDownEmail(downDetail(), { environment: 'dev' });
    expect(email.subject.startsWith('[dev] ')).toBe(true);
  });

  it('does not prefix the subject in prod', () => {
    const email = renderDownEmail(downDetail(), { environment: 'prod' });
    expect(email.subject.startsWith('[dev]')).toBe(false);
  });

  it('includes both text and html bodies containing the url', () => {
    const email = renderDownEmail(downDetail(), { environment: 'prod' });
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.html.length).toBeGreaterThan(0);
    expect(email.text).toContain('https://example.com/health');
    expect(email.html).toContain('https://example.com/health');
  });

  it('includes the error type and message in the body', () => {
    const email = renderDownEmail(downDetail(), { environment: 'prod' });
    expect(email.text).toContain('timeout');
    expect(email.text).toContain('timed out after 10000ms');
  });

  it('HTML-escapes a malicious error_message from the monitored server', () => {
    const email = renderDownEmail(downDetail({ error_message: '<script>alert(1)</script>' }), { environment: 'prod' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('HTML-escapes a malicious site name', () => {
    const email = renderDownEmail(downDetail({ name: '<img src=x onerror=alert(1)>' }), { environment: 'prod' });
    expect(email.html).not.toContain('<img');
  });

  it('HTML-escapes a malicious url', () => {
    const email = renderDownEmail(downDetail({ url: 'https://example.com/"><script>alert(1)</script>' }), {
      environment: 'prod',
    });
    expect(email.html).not.toContain('<script>');
  });
});

describe('renderRecoveredEmail', () => {
  it('builds a subject naming the site as recovered', () => {
    const email = renderRecoveredEmail(recoveredDetail(), { environment: 'prod' });
    expect(email.subject).toContain('RECOVERED');
    expect(email.subject).toContain('Example Site');
  });

  it('states the downtime duration when previous_status_change_at is present', () => {
    const email = renderRecoveredEmail(recoveredDetail(), { environment: 'prod' });
    // 13:51:00 -> 14:05:00 is 14 minutes.
    expect(email.text).toMatch(/14 minute/);
  });

  it('omits the downtime duration when previous_status_change_at is null', () => {
    const email = renderRecoveredEmail(recoveredDetail({ previous_status_change_at: null }), { environment: 'prod' });
    expect(email.text).not.toMatch(/minute/);
  });

  it('includes both text and html bodies containing the url', () => {
    const email = renderRecoveredEmail(recoveredDetail(), { environment: 'prod' });
    expect(email.text).toContain('https://example.com/health');
    expect(email.html).toContain('https://example.com/health');
  });
});
