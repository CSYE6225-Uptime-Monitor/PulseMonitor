const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const config = require('../config/env');

const client = new DynamoDBClient({
  region: config.awsRegion,
  ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
});

const docClient = DynamoDBDocumentClient.from(client);

module.exports = { docClient };
