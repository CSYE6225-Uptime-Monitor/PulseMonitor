const express = require('express');
const userService = require('../services/userService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { doubleCsrfProtection, generateCsrfToken } = require('../middleware/csrf');
const { loginSchema } = require('../schemas/userSchemas');
const AppError = require('../errors/AppError');

const router = express.Router();

router.get('/v1/csrf-token', (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ success: true, data: { csrfToken }, error: null });
});

router.post('/v1/login', doubleCsrfProtection, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const user = await userService.verifyCredentials(email, password);
    if (!user) {
      throw new AppError(401, 'Invalid email or password.');
    }
    req.session.email = user.email;
    res.json({ success: true, data: user, error: null });
  } catch (error) {
    next(error);
  }
});

router.post('/v1/logout', requireAuth, doubleCsrfProtection, (req, res) => {
  req.session = null;
  res.json({ success: true, data: null, error: null });
});

module.exports = router;
