const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');

const ddbMock = mockClient(docClient);
// Site mutations (and the login inside loginAgent) now write audit events -
// without this, PutObjectCommand would hit real AWS.
const s3Mock = mockClient(s3Client);

const USERS_TABLE = 'pulsemonitor-test-users';
const SITES_TABLE = 'pulsemonitor-test-sites';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_SITE_ID = '22222222-2222-4222-8222-222222222222';

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

describe('sites API', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
  });

  describe('POST /v1/sites', () => {
    it('creates a site with defaults and returns 201', async () => {
      const { agent, csrfToken } = await loginAgent();
      ddbMock.on(PutCommand, { TableName: SITES_TABLE }).resolves({});

      const res = await agent
        .post('/v1/sites')
        .set('x-csrf-token', csrfToken)
        .send({ url: 'https://example.com', name: 'My Site' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('My Site');
      expect(res.body.data.check_frequency_minutes).toBe(5);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.status.status).toBe('unknown');
    });

    it('stores the site under the session user_id', async () => {
      const { agent, csrfToken } = await loginAgent();
      ddbMock.on(PutCommand, { TableName: SITES_TABLE }).resolves({});

      await agent.post('/v1/sites').set('x-csrf-token', csrfToken).send({ url: 'https://example.com', name: 'x' });

      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.Item.user_id).toBe(USER_ID);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).post('/v1/sites').send({ url: 'https://example.com', name: 'x' });
      expect(res.status).toBe(401);
    });

    it('returns 403 without a CSRF token', async () => {
      const { agent } = await loginAgent();
      const res = await agent.post('/v1/sites').send({ url: 'https://example.com', name: 'x' });
      expect(res.status).toBe(403);
    });

    it('returns 400 for a missing name', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent.post('/v1/sites').set('x-csrf-token', csrfToken).send({ url: 'https://example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a private-IP url', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .post('/v1/sites')
        .set('x-csrf-token', csrfToken)
        .send({ url: 'http://127.0.0.1', name: 'x' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a javascript: url', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .post('/v1/sites')
        .set('x-csrf-token', csrfToken)
        .send({ url: 'javascript:alert(1)', name: 'x' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown field', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .post('/v1/sites')
        .set('x-csrf-token', csrfToken)
        .send({ url: 'https://example.com', name: 'x', isAdmin: true });
      expect(res.status).toBe(400);
    });

    it('returns 400 for check_frequency_minutes below the 5-minute floor', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .post('/v1/sites')
        .set('x-csrf-token', csrfToken)
        .send({ url: 'https://example.com', name: 'x', check_frequency_minutes: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/sites', () => {
    it('returns only the caller sites, queried by the session user_id', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(QueryCommand, { TableName: SITES_TABLE }).resolves({
        Items: [
          {
            user_id: USER_ID,
            site_id: VALID_SITE_ID,
            url: 'https://example.com',
            name: 'x',
            enabled: true,
            check_frequency_minutes: 5,
          },
        ],
      });

      const res = await agent.get('/v1/sites');

      expect(res.status).toBe(200);
      expect(res.body.data.sites).toHaveLength(1);
      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':user_id': USER_ID });
    });

    it('returns an empty list for a new user', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(QueryCommand, { TableName: SITES_TABLE }).resolves({ Items: [] });

      const res = await agent.get('/v1/sites');

      expect(res.status).toBe(200);
      expect(res.body.data.sites).toEqual([]);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).get('/v1/sites');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/sites/:id', () => {
    it('returns the site', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({
        Item: { user_id: USER_ID, site_id: VALID_SITE_ID, url: 'https://example.com', name: 'x' },
      });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.site_id).toBe(VALID_SITE_ID);
    });

    it('returns 404 for another user site without leaking existence', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: undefined });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error).not.toMatch(/forbid|permission/i);
    });

    it('returns 404 for an unknown id', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: undefined });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-uuid id', async () => {
      const { agent } = await loginAgent();
      const res = await agent.get('/v1/sites/not-a-uuid');
      expect(res.status).toBe(400);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).get(`/v1/sites/${VALID_SITE_ID}`);
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /v1/sites/:id', () => {
    it('updates only the provided fields, never touching pinger-written status', async () => {
      const { agent, csrfToken } = await loginAgent();
      ddbMock.on(UpdateCommand, { TableName: SITES_TABLE }).resolves({
        Attributes: { user_id: USER_ID, site_id: VALID_SITE_ID, name: 'new-name' },
      });

      const res = await agent
        .put(`/v1/sites/${VALID_SITE_ID}`)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'new-name' });

      expect(res.status).toBe(200);
      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.UpdateExpression).not.toContain('#status');
      expect(call.args[0].input.Key).toEqual({ user_id: USER_ID, site_id: VALID_SITE_ID });
    });

    it('returns 404 when the conditional check fails', async () => {
      const { agent, csrfToken } = await loginAgent();
      const err = new Error('missing');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand, { TableName: SITES_TABLE }).rejects(err);

      const res = await agent.put(`/v1/sites/${VALID_SITE_ID}`).set('x-csrf-token', csrfToken).send({ name: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for an empty body', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent.put(`/v1/sites/${VALID_SITE_ID}`).set('x-csrf-token', csrfToken).send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown field', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .put(`/v1/sites/${VALID_SITE_ID}`)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'up' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a private-IP url', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent
        .put(`/v1/sites/${VALID_SITE_ID}`)
        .set('x-csrf-token', csrfToken)
        .send({ url: 'http://127.0.0.1' });
      expect(res.status).toBe(400);
    });

    it('returns 403 without a CSRF token', async () => {
      const { agent } = await loginAgent();
      const res = await agent.put(`/v1/sites/${VALID_SITE_ID}`).send({ name: 'x' });
      expect(res.status).toBe(403);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).put(`/v1/sites/${VALID_SITE_ID}`).send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for a non-uuid id', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent.put('/v1/sites/not-a-uuid').set('x-csrf-token', csrfToken).send({ name: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /v1/sites/:id', () => {
    it('returns 204 with an empty body', async () => {
      const { agent, csrfToken } = await loginAgent();
      ddbMock.on(DeleteCommand, { TableName: SITES_TABLE }).resolves({});

      const res = await agent.delete(`/v1/sites/${VALID_SITE_ID}`).set('x-csrf-token', csrfToken);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    });

    it('issues a DeleteCommand keyed on the session user_id', async () => {
      const { agent, csrfToken } = await loginAgent();
      ddbMock.on(DeleteCommand, { TableName: SITES_TABLE }).resolves({});

      await agent.delete(`/v1/sites/${VALID_SITE_ID}`).set('x-csrf-token', csrfToken);

      const call = ddbMock.commandCalls(DeleteCommand)[0];
      expect(call.args[0].input.Key).toEqual({ user_id: USER_ID, site_id: VALID_SITE_ID });
    });

    it('returns 404 for another user site', async () => {
      const { agent, csrfToken } = await loginAgent();
      const err = new Error('missing');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(DeleteCommand, { TableName: SITES_TABLE }).rejects(err);

      const res = await agent.delete(`/v1/sites/${VALID_SITE_ID}`).set('x-csrf-token', csrfToken);
      expect(res.status).toBe(404);
    });

    it('returns 403 without a CSRF token', async () => {
      const { agent } = await loginAgent();
      const res = await agent.delete(`/v1/sites/${VALID_SITE_ID}`);
      expect(res.status).toBe(403);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).delete(`/v1/sites/${VALID_SITE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 400 for a non-uuid id', async () => {
      const { agent, csrfToken } = await loginAgent();
      const res = await agent.delete('/v1/sites/not-a-uuid').set('x-csrf-token', csrfToken);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/sites/:id/status', () => {
    it('returns unknown status for a never-checked site', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({
        Item: { user_id: USER_ID, site_id: VALID_SITE_ID },
      });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}/status`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unknown');
      expect(res.body.data.consecutive_failures).toBe(0);
    });

    it('returns the latest pinger result', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({
        Item: {
          user_id: USER_ID,
          site_id: VALID_SITE_ID,
          status: 'up',
          status_code: 200,
          latency_ms: 100,
          checked_at: '2026-08-02T14:05:03.123Z',
        },
      });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}/status`);

      expect(res.body.data.status).toBe('up');
      expect(res.body.data.status_code).toBe(200);
      expect(res.body.data.latency_ms).toBe(100);
    });

    it('returns 404 for another user site', async () => {
      const { agent } = await loginAgent();
      ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: undefined });

      const res = await agent.get(`/v1/sites/${VALID_SITE_ID}/status`);
      expect(res.status).toBe(404);
    });

    it('returns 401 without a session', async () => {
      const res = await request(app).get(`/v1/sites/${VALID_SITE_ID}/status`);
      expect(res.status).toBe(401);
    });

    it('returns 400 for a non-uuid id', async () => {
      const { agent } = await loginAgent();
      const res = await agent.get('/v1/sites/not-a-uuid/status');
      expect(res.status).toBe(400);
    });
  });

  describe('cross-cutting invariants', () => {
    it('prefers 401 over 400 for an unauthenticated request to a malformed id', async () => {
      const res = await request(app).get('/v1/sites/not-a-uuid');
      expect(res.status).toBe(401);
    });
  });
});
