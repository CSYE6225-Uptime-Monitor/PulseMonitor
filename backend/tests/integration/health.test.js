const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const { docClient } = require('../../src/db/dynamo');
const app = require('../../src/app');

const ddbMock = mockClient(docClient);

describe('GET /healthz', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('returns 200 when DynamoDB is reachable', async () => {
    ddbMock.on(DescribeTableCommand).resolves({ Table: { TableStatus: 'ACTIVE' } });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 503 when DynamoDB is unreachable', async () => {
    ddbMock.on(DescribeTableCommand).rejects(new Error('connection refused'));
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
