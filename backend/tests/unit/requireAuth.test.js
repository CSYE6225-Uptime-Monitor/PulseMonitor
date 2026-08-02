const requireAuth = require('../../src/middleware/requireAuth');
const AppError = require('../../src/errors/AppError');

describe('requireAuth', () => {
  it('calls next with a 401 AppError when there is no session', () => {
    const req = {};
    const next = jest.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next with a 401 AppError when the session has no email', () => {
    const req = { session: {} };
    const next = jest.fn();

    requireAuth(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next with a 401 AppError when the session has an email but no user_id', () => {
    const req = { session: { email: 'jane@example.com' } };
    const next = jest.fn();

    requireAuth(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next() with no error when the session has both email and user_id', () => {
    const req = { session: { email: 'jane@example.com', user_id: '11111111-1111-4111-8111-111111111111' } };
    const next = jest.fn();

    requireAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith();
  });
});
