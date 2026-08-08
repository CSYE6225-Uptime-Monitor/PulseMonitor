const { activityQuerySchema } = require('../../src/schemas/auditSchemas');

describe('activityQuerySchema', () => {
  it('accepts an empty query, defaulting limit and leaving cursor undefined', () => {
    const result = activityQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(20);
    expect(result.data.cursor).toBeUndefined();
  });

  it('coerces a numeric-string limit within range', () => {
    const result = activityQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(50);
  });

  it('rejects a limit over 100', () => {
    const result = activityQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects a limit under 1', () => {
    const result = activityQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts an opaque cursor string', () => {
    const result = activityQuerySchema.safeParse({ cursor: 'eyJ2IjoxLCJrIjoieCJ9' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown query parameter', () => {
    const result = activityQuerySchema.safeParse({ order: 'desc' });
    expect(result.success).toBe(false);
  });
});
