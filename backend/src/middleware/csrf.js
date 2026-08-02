const crypto = require('crypto');
const { doubleCsrf } = require('csrf-csrf');
const config = require('../config/env');

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => config.sessionSecret,
  getSessionIdentifier: (req) => {
    if (!req.session.csrfId) {
      req.session.csrfId = crypto.randomBytes(16).toString('hex');
    }
    return req.session.csrfId;
  },
  cookieName: 'pm_csrf',
  cookieOptions: {
    sameSite: 'lax',
    httpOnly: true,
    secure: config.cookieSecure,
  },
});

module.exports = { doubleCsrfProtection, generateCsrfToken };
