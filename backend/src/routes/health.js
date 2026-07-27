const express = require('express');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { docClient } = require('../db/dynamo');
const config = require('../config/env');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/healthz', async (req, res) => {
  try {
    await docClient.send(new DescribeTableCommand({ TableName: config.usersTable }));
    res.status(200).json({ success: true, data: { status: 'ok' }, error: null });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({ success: false, data: null, error: 'Service unavailable.' });
  }
});

module.exports = router;
