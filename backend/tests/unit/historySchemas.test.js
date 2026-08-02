const { historyQuerySchema } = require('../../src/schemas/historySchemas');

describe('historyQuerySchema', () => {
  it('accepts an empty query, leaving from/to/limit/cursor undefined', () => {
    const result = historyQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.from).toBeUndefined();
    expect(result.data.to).toBeUndefined();
    expect(result.data.limit).toBeUndefined();
    expect(result.data.cursor).toBeUndefined();
  });

  it('accepts valid ISO-8601 from/to', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO-8601 from', () => {
    const result = historyQuerySchema.safeParse({ from: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-ISO-8601 to', () => {
    const result = historyQuerySchema.safeParse({ to: 'yesterday' });
    expect(result.success).toBe(false);
  });

  it('rejects when to is before from', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-08-02T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when to equals from', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-08-02T00:00:00.000Z',
      to: '2026-08-02T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('coerces a numeric-string limit within range', () => {
    const result = historyQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(50);
  });

  it('rejects a limit over 100', () => {
    const result = historyQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects a limit under 1', () => {
    const result = historyQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts an opaque cursor string', () => {
    const result = historyQuerySchema.safeParse({ cursor: 'eyJ2IjoxLCJrIjoieCJ9' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown query parameter', () => {
    const result = historyQuerySchema.safeParse({ order: 'desc' });
    expect(result.success).toBe(false);
  });
});
