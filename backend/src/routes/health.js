const express = require('express');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');
const { docClient } = require('../db/dynamo');
const { s3Client } = require('../db/s3');
const config = require('../config/env');
const logger = require('../utils/logger');

const router = express.Router();

// Checks every data store the API depends on, not just the users table -
// otherwise a broken sites table or history bucket leaves the ALB routing
// traffic to an instance whose entire /v1/sites* surface 500s.
router.get('/healthz', async (req, res) => {
  try {
    await Promise.all([
      docClient.send(new DescribeTableCommand({ TableName: config.usersTable })),
      docClient.send(new DescribeTableCommand({ TableName: config.sitesTable })),
      s3Client.send(new HeadBucketCommand({ Bucket: config.historyBucket })),
    ]);
    res.status(200).json({ success: true, data: { status: 'ok' }, error: null });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({ success: false, data: null, error: 'Service unavailable.' });
  }
});

module.exports = router;
