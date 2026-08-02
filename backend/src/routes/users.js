const express = require('express');
const userService = require('../services/userService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { createUserSchema, updateUserSchema } = require('../schemas/userSchemas');

const router = express.Router();

router.post('/v1/user', doubleCsrfProtection, validate(createUserSchema), async (req, res, next) => {
  try {
    const user = await userService.createUser(req.validated);
    res.status(201).json({ success: true, data: user, error: null });
  } catch (error) {
    next(error);
  }
});

router.get('/v1/user/self', requireAuth, async (req, res, next) => {
  try {
    const user = await userService.getSelf(req.session.email);
    res.json({ success: true, data: user, error: null });
  } catch (error) {
    next(error);
  }
});

router.put('/v1/user/self', requireAuth, doubleCsrfProtection, validate(updateUserSchema), async (req, res, next) => {
  try {
    const user = await userService.updateSelf(req.session.email, req.validated);
    res.json({ success: true, data: user, error: null });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
