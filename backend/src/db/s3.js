const { S3Client } = require('@aws-sdk/client-s3');
const config = require('../config/env');

const s3Client = new S3Client({
  region: config.awsRegion,
  ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
});

module.exports = { s3Client };
