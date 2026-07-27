const express = require('express');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const sessionMiddleware = require('./middleware/session');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware());

app.use('/', routes);
app.use(healthRoutes);
app.use(authRoutes);
app.use(userRoutes);

app.use(errorHandler);

module.exports = app;
