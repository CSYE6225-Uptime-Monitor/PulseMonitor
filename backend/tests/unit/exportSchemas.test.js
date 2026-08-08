const { exportIdParamSchema } = require('../../src/schemas/exportSchemas');

describe('exportIdParamSchema', () => {
  it('accepts a well-formed export id', () => {
    const result = exportIdParamSchema.safeParse({ id: '1700000000000-abcdef12' });
    expect(result.success).toBe(true);
  });

  it('rejects an id with a 12-digit epoch', () => {
    const result = exportIdParamSchema.safeParse({ id: '170000000000-abcdef12' });
    expect(result.success).toBe(false);
  });

  it('rejects an id with uppercase hex', () => {
    const result = exportIdParamSchema.safeParse({ id: '1700000000000-ABCDEF12' });
    expect(result.success).toBe(false);
  });

  it('rejects a path-traversal id', () => {
    const result = exportIdParamSchema.safeParse({ id: '../../other-user/1700000000000-abcdef12' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown param', () => {
    const result = exportIdParamSchema.safeParse({ id: '1700000000000-abcdef12', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
