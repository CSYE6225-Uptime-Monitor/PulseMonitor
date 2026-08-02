const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, data: null, error: err.message });
  }

  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ success: false, data: null, error: 'Invalid or missing CSRF token.' });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({ success: false, data: null, error: 'Internal server error.' });
}

module.exports = errorHandler;
