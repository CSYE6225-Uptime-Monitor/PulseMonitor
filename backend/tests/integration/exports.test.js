const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed?X-Amz-Signature=abc'),
}));

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');
const { prefixFor } = require('../../src/utils/exportKeys');
const config = require('../../src/config/env');

const ddbMock = mockClient(docClient);
const s3Mock = mockClient(s3Client);

const USERS_TABLE = 'pulsemonitor-test-users';
const SITES_TABLE = 'pulsemonitor-test-sites';
const USER_ID = '11111111-1111-4111-8111-111111111111';

async function getCsrfToken(agent) {
  const res = await agent.get('/v1/csrf-token');
  return res.body.data.csrfToken;
}

async function loginAgent() {
  const passwordHash = await bcrypt.hash('supersecret', 4);
  ddbMock.on(GetCommand, { TableName: USERS_TABLE }).resolves({
    Item: {
      email: 'jane@example.com',
      user_id: USER_ID,
      password_hash: passwordHash,
      first_name: 'Jane',
      last_name: 'Doe',
    },
  });

  const agent = request.agent(app);
  const csrfToken = await getCsrfToken(agent);
  await agent.post('/v1/login').set('x-csrf-token', csrfToken).send({ email: 'jane@example.com', password: 'supersecret' });

  return { agent, csrfToken };
}

function keyFor(exportId) {
  return `${prefixFor(config.exportPrefix, USER_ID)}${exportId}.json`;
}

describe('exports API', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    ddbMock.on(QueryCommand, { TableName: SITES_TABLE }).resolves({ Items: [] });
  });

  describe('POST /v1/user/self/exports', () => {
    it('returns 401 without a session', async () => {
      const res = await request(app).post('/v1/user/self/exports');
      expect(res.status).toBe(401);
    });

    it('returns 403 without a CSRF token', async () => {
      const { agent } = await loginAgent();
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });
      const res = await agent.post('/v1/user/self/exports');
      expect(res.status).toBe(403);
    });

    it('creates an export and returns status ready', async () => {
      const { agent, csrfToken } = await loginAgent();
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

      const res = await agent.post('/v1/user/self/exports').set('x-csrf-token', csrfToken);

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.export_id).toMatch(/^\d{13}-[0-9a-f]{8}$/);
    });

    it('returns 429 when an export was created within the throttle window', async () => {
      const { agent, csrfToken } = await loginAgent();
      const recentMs = Date.now() - 1000;
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: keyFor(`${recentMs}-aaaaaaaa`), Size: 10 }],
        IsTruncated: false,
      });

      const res = await agent.post('/v1/user/self/exports').set('x-csrf-token', csrfToken);

      expect(res.status).toBe(429);
    });
  });

  describe('GET /v1/user/self/exports', () => {
    it('returns 401 without a session', async () => {
      const res = await request(app).get('/v1/user/self/exports');
      expect(res.status).toBe(401);
    });

    it('lists exports newest first', async () => {
      const { agent } = await loginAgent();
      const older = `${Date.now() - 60_000}-aaaaaaaa`;
      const newer = `${Date.now() - 1_000}-bbbbbbbb`;
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: keyFor(older), Size: 1 },
          { Key: keyFor(newer), Size: 2 },
        ],
        IsTruncated: false,
      });

      const res = await agent.get('/v1/user/self/exports');

      expect(res.status).toBe(200);
      expect(res.body.data.exports.map((e) => e.export_id)).toEqual([newer, older]);
    });

    it('does not require a CSRF token for the read', async () => {
      const { agent } = await loginAgent();
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

      const res = await agent.get('/v1/user/self/exports');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/user/self/exports/:id/download', () => {
    it('returns 401 without a session', async () => {
      const res = await request(app).get('/v1/user/self/exports/1700000000000-aaaaaaaa/download');
      expect(res.status).toBe(401);
    });

    it('returns 400 for a malformed export id', async () => {
      const { agent } = await loginAgent();
      const res = await agent.get('/v1/user/self/exports/not-an-id/download');
      expect(res.status).toBe(400);
    });

    it('returns the same 404 body for an unknown id as for another user id', async () => {
      const { agent } = await loginAgent();
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

      const unknownRes = await agent.get('/v1/user/self/exports/1700000000000-aaaaaaaa/download');
      const otherRes = await agent.get('/v1/user/self/exports/1700000000001-bbbbbbbb/download');

      expect(unknownRes.status).toBe(404);
      expect(otherRes.status).toBe(404);
      expect(otherRes.body).toEqual(unknownRes.body);
    });

    it('returns a presigned url envelope for a matching id (200, not a 302)', async () => {
      const { agent } = await loginAgent();
      const id = `${Date.now()}-aaaaaaaa`;
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: keyFor(id), Size: 5 }], IsTruncated: false });

      const res = await agent.get(`/v1/user/self/exports/${id}/download`);

      expect(res.status).toBe(200);
      expect(res.body.data.url).toMatch(/X-Amz-Signature/);
      expect(res.body.data.filename).toMatch(/^pulsemonitor-export-.*\.json$/);
    });
  });
});
