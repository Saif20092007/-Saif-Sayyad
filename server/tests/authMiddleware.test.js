// Unit tests for the authentication and password-change enforcement middleware
const { mustChangePasswordMiddleware } = require('../middleware/auth');

describe('mustChangePasswordMiddleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      user: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should reject requests with 403 Forbidden if mustChangePassword is true', async () => {
    req.user.mustChangePassword = true;

    await mustChangePasswordMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorPassed = next.mock.calls[0][0];
    expect(errorPassed).toBeInstanceOf(Error);
    expect(errorPassed.status).toBe(403);
    expect(errorPassed.message).toContain('You must change your temporary password');
  });

  test('should allow requests to pass through if mustChangePassword is false', async () => {
    req.user.mustChangePassword = false;

    await mustChangePasswordMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // called with no arguments, meaning success
  });

  test('should allow requests to pass through if mustChangePassword is not present', async () => {
    req.user.mustChangePassword = undefined;

    await mustChangePasswordMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
