const express = require('express');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const sessionMiddleware = require('./middleware/session');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/account');
const siteRoutes = require('./routes/sites');

const app = express();

// Required behind nginx + the ALB: without it, req.secure and req.ip are
// derived from the direct (loopback) connection instead of X-Forwarded-*.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware());

app.use('/', routes);
app.use(healthRoutes);
app.use(authRoutes);
app.use(userRoutes);
app.use(accountRoutes);
app.use(siteRoutes);

app.use(errorHandler);

module.exports = app;
