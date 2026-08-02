const AppError = require('../errors/AppError');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.email) {
    return next(new AppError(401, 'Authentication required.'));
  }
  next();
}

module.exports = requireAuth;
