const { createSiteSchema, updateSiteSchema, siteIdParamSchema } = require('../../src/schemas/siteSchemas');

describe('createSiteSchema', () => {
  it('requires url and name', () => {
    expect(createSiteSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', isAdmin: true });
    expect(result.success).toBe(false);
  });

  it('rejects a javascript: url', () => {
    const result = createSiteSchema.safeParse({ url: 'javascript:alert(1)', name: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a private-IP url', () => {
    const result = createSiteSchema.safeParse({ url: 'http://127.0.0.1', name: 'x' });
    expect(result.success).toBe(false);
  });

  it('accepts a public https url', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com/health', name: 'My Site' });
    expect(result.success).toBe(true);
  });

  it('defaults check_frequency_minutes to 5', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x' });
    expect(result.success).toBe(true);
    expect(result.data.check_frequency_minutes).toBe(5);
  });

  it('defaults enabled to true', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x' });
    expect(result.data.enabled).toBe(true);
  });

  it('rejects check_frequency_minutes below the 5-minute floor', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', check_frequency_minutes: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a check_frequency_minutes value outside the allowed set', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', check_frequency_minutes: 7 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer check_frequency_minutes', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', check_frequency_minutes: 5.5 });
    expect(result.success).toBe(false);
  });

  it('accepts an explicit check_frequency_minutes of 5', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', check_frequency_minutes: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts an explicit enabled:false', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x', enabled: false });
    expect(result.success).toBe(true);
    expect(result.data.enabled).toBe(false);
  });

  it('rejects a name longer than 100 characters', () => {
    const result = createSiteSchema.safeParse({ url: 'https://example.com', name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('updateSiteSchema', () => {
  it('requires at least one field', () => {
    expect(updateSiteSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(updateSiteSchema.safeParse({ name: 'x', status: 'up' }).success).toBe(false);
  });

  it('accepts enabled:false alone', () => {
    const result = updateSiteSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it('applies the same url policy as create', () => {
    const result = updateSiteSchema.safeParse({ url: 'http://127.0.0.1' });
    expect(result.success).toBe(false);
  });
});

describe('siteIdParamSchema', () => {
  it('rejects a non-uuid id', () => {
    expect(siteIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts a uuid', () => {
    expect(siteIdParamSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success).toBe(true);
  });
});
