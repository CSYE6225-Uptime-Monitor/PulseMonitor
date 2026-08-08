const express = require('express');
const userService = require('../services/userService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const audit = require('../middleware/audit');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { createUserSchema, updateUserSchema } = require('../schemas/userSchemas');
const { AUDIT_EVENTS } = require('../utils/auditEvents');

const router = express.Router();

router.post(
  '/v1/user',
  doubleCsrfProtection,
  validate(createUserSchema),
  audit({ eventType: AUDIT_EVENTS.USER_CREATED, resourceType: 'user' }),
  async (req, res, next) => {
    try {
      const user = await userService.createUser(req.validated);
      // No session exists yet for a fresh signup - the user_id is only known
      // after creation, so it must be supplied here rather than read from a
      // (nonexistent) session snapshot.
      res.locals.audit = { user_id: user.user_id, actor_email: user.email, resource_id: user.user_id };
      res.status(201).json({ success: true, data: user, error: null });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/v1/user/self', requireAuth, async (req, res, next) => {
  try {
    const user = await userService.getSelf(req.session.email);
    res.json({ success: true, data: user, error: null });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/v1/user/self',
  requireAuth,
  doubleCsrfProtection,
  validate(updateUserSchema),
  audit({ eventType: AUDIT_EVENTS.USER_UPDATED, resourceType: 'user' }),
  async (req, res, next) => {
    try {
      const user = await userService.updateSelf(req.session.email, req.validated);
      res.locals.audit = { resource_id: user.user_id };
      res.json({ success: true, data: user, error: null });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
