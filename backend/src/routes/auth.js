const express = require('express');
const userService = require('../services/userService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const audit = require('../middleware/audit');
const { doubleCsrfProtection, generateCsrfToken } = require('../middleware/csrf');
const { loginSchema } = require('../schemas/userSchemas');
const { AUDIT_EVENTS } = require('../utils/auditEvents');
const AppError = require('../errors/AppError');

const router = express.Router();

router.get('/v1/csrf-token', (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ success: true, data: { csrfToken }, error: null });
});

router.post(
  '/v1/login',
  doubleCsrfProtection,
  validate(loginSchema),
  // Placed here (after validate/CSRF, before the handler) so a thrown 401
  // is still captured by the finish hook - see middleware/audit.js. There is
  // no session yet, so res.locals.audit below is what carries user_id.
  audit({ eventType: AUDIT_EVENTS.AUTH_LOGIN_SUCCEEDED }),
  async (req, res, next) => {
    try {
      const { email, password } = req.validated;
      const user = await userService.verifyCredentials(email, password);
      if (!user) {
        // verifyCredentials returning null can't distinguish "no such user"
        // from "wrong password" - recording the found id here would be a
        // user-enumeration side channel, so a failed login writes under the
        // _anonymous partition (auditService's default) instead.
        res.locals.audit = { event_type: AUDIT_EVENTS.AUTH_LOGIN_FAILED };
        throw new AppError(401, 'Invalid email or password.');
      }
      req.session.email = user.email;
      req.session.user_id = user.user_id;
      res.locals.audit = { user_id: user.user_id, actor_email: user.email };
      res.json({ success: true, data: user, error: null });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/v1/logout',
  requireAuth,
  doubleCsrfProtection,
  audit({ eventType: AUDIT_EVENTS.AUTH_LOGOUT }),
  (req, res) => {
    req.session = null;
    res.json({ success: true, data: null, error: null });
  }
);

module.exports = router;
