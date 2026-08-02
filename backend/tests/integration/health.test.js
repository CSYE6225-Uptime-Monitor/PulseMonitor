const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { HeadBucketCommand } = require('@aws-sdk/client-s3');

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');
const config = require('../../src/config/env');

const ddbMock = mockClient(docClient);
const s3Mock = mockClient(s3Client);

function allStoresHealthy() {
  ddbMock.on(DescribeTableCommand).resolves({ Table: { TableStatus: 'ACTIVE' } });
  s3Mock.on(HeadBucketCommand).resolves({});
}

describe('GET /healthz', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
  });

  it('returns 200 when the users table, sites table, and history bucket are all reachable', async () => {
    allStoresHealthy();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('checks the users table', async () => {
    allStoresHealthy();
    await request(app).get('/healthz');

    const call = ddbMock.commandCalls(DescribeTableCommand, { TableName: config.usersTable })[0];
    expect(call).toBeDefined();
  });

  it('checks the sites table', async () => {
    allStoresHealthy();
    await request(app).get('/healthz');

    const call = ddbMock.commandCalls(DescribeTableCommand, { TableName: config.sitesTable })[0];
    expect(call).toBeDefined();
  });

  it('checks the history bucket', async () => {
    allStoresHealthy();
    await request(app).get('/healthz');

    const call = s3Mock.commandCalls(HeadBucketCommand, { Bucket: config.historyBucket })[0];
    expect(call).toBeDefined();
  });

  it('returns 503 when the users table is unreachable', async () => {
    ddbMock
      .on(DescribeTableCommand, { TableName: config.usersTable })
      .rejects(new Error('connection refused'))
      .on(DescribeTableCommand, { TableName: config.sitesTable })
      .resolves({ Table: { TableStatus: 'ACTIVE' } });
    s3Mock.on(HeadBucketCommand).resolves({});

    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('returns 503 when the sites table is unreachable while the users table is fine', async () => {
    ddbMock
      .on(DescribeTableCommand, { TableName: config.usersTable })
      .resolves({ Table: { TableStatus: 'ACTIVE' } })
      .on(DescribeTableCommand, { TableName: config.sitesTable })
      .rejects(new Error('connection refused'));
    s3Mock.on(HeadBucketCommand).resolves({});

    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  it('returns 503 when the history bucket is unreachable while both tables are fine', async () => {
    ddbMock.on(DescribeTableCommand).resolves({ Table: { TableStatus: 'ACTIVE' } });
    s3Mock.on(HeadBucketCommand).rejects(new Error('connection refused'));

    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
