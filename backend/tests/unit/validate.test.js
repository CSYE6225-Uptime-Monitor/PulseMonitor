const { z } = require('zod');
const validate = require('../../src/middleware/validate');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validate', () => {
  const bodySchema = z.object({ name: z.string() }).strict();
  const paramsSchema = z.object({ id: z.uuid() }).strict();

  it('defaults to req.body and sets req.validated', () => {
    const req = { body: { name: 'site-1' } };
    const res = mockRes();
    const next = jest.fn();

    validate(bodySchema)(req, res, next);

    expect(req.validated).toEqual({ name: 'site-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('validates req.params when source is "params" and sets req.validatedParams', () => {
    const req = { params: { id: '11111111-1111-4111-8111-111111111111' } };
    const res = mockRes();
    const next = jest.fn();

    validate(paramsSchema, 'params')(req, res, next);

    expect(req.validatedParams).toEqual({ id: '11111111-1111-4111-8111-111111111111' });
    expect(next).toHaveBeenCalledWith();
  });

  it('leaves req.params untouched', () => {
    const original = { id: '11111111-1111-4111-8111-111111111111' };
    const req = { params: original };
    const res = mockRes();
    const next = jest.fn();

    validate(paramsSchema, 'params')(req, res, next);

    expect(req.params).toBe(original);
  });

  it('returns 400 with issues joined as "path: message" for an invalid body', () => {
    const req = { body: { name: 42 } };
    const res = mockRes();
    const next = jest.fn();

    validate(bodySchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/^name: /);
  });

  it('returns 400 for a non-uuid params value', () => {
    const req = { params: { id: 'not-a-uuid' } };
    const res = mockRes();
    const next = jest.fn();

    validate(paramsSchema, 'params')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('validates req.query when source is "query" and sets req.validatedQuery', () => {
    const querySchema = z.object({ limit: z.string().optional() }).strict();
    const req = { query: { limit: '10' } };
    const res = mockRes();
    const next = jest.fn();

    validate(querySchema, 'query')(req, res, next);

    expect(req.validatedQuery).toEqual({ limit: '10' });
    expect(next).toHaveBeenCalledWith();
  });
});
