const cookieSession = require('cookie-session');
const config = require('../config/env');

function sessionMiddleware() {
  return cookieSession({
    name: 'pm_session',
    keys: [config.sessionSecret],
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
  });
}

module.exports = sessionMiddleware;
