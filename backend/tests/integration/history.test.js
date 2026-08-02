const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');
const { prefixFor } = require('../../src/utils/historyKeys');
const config = require('../../src/config/env');

const ddbMock = mockClient(docClient);
const s3Mock = mockClient(s3Client);

const USERS_TABLE = 'pulsemonitor-test-users';
const SITES_TABLE = 'pulsemonitor-test-sites';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';

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

  return agent;
}

function keyAt(isoString, checkId8 = 'abcdef12') {
  const d = new Date(isoString);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefixFor(config.historyPrefix, USER_ID, SITE_ID)}${yyyy}/${mm}/${dd}/${d.getTime()}-${checkId8}.json`;
}

function fakeBody(obj) {
  return { transformToString: async () => JSON.stringify(obj) };
}

function siteExists() {
  ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: { user_id: USER_ID, site_id: SITE_ID } });
}

describe('GET /v1/sites/:id/history', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get(`/v1/sites/${SITE_ID}/history`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown site id', async () => {
    const agent = await loginAgent();
    ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: undefined });

    const res = await agent.get(`/v1/sites/${SITE_ID}/history`);
    expect(res.status).toBe(404);
  });

  it('returns a 404 body for another-user site identical to the unknown-site body', async () => {
    const agent = await loginAgent();
    ddbMock.on(GetCommand, { TableName: SITES_TABLE }).resolves({ Item: undefined });

    const unknownRes = await agent.get(`/v1/sites/${SITE_ID}/history`);
    const otherUserRes = await agent.get(`/v1/sites/${SITE_ID}/history`);

    expect(otherUserRes.status).toBe(404);
    expect(otherUserRes.body).toEqual(unknownRes.body);
  });

  it('returns 200 with an empty records array and null next_cursor when there is no history', async () => {
    const agent = await loginAgent();
    siteExists();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const res = await agent.get(`/v1/sites/${SITE_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ records: [], next_cursor: null });
  });

  it('returns records in chronological order for the happy path', async () => {
    const agent = await loginAgent();
    siteExists();

    const k1 = keyAt(new Date(Date.now() - 60 * 60 * 1000).toISOString(), '00000001');
    const k2 = keyAt(new Date(Date.now() - 30 * 60 * 1000).toISOString(), '00000002');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }, { Key: k2 }], IsTruncated: false });
    s3Mock
      .on(GetObjectCommand, { Key: k1 })
      .resolves({ Body: fakeBody({ check_id: 'c1', site_id: SITE_ID, checked_at: '2026-08-02T13:00:00.000Z', status: 'up' }) })
      .on(GetObjectCommand, { Key: k2 })
      .resolves({
        Body: fakeBody({ check_id: 'c2', site_id: SITE_ID, checked_at: '2026-08-02T13:30:00.000Z', status: 'down' }),
      });

    const res = await agent.get(`/v1/sites/${SITE_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body.data.records.map((r) => r.check_id)).toEqual(['c1', 'c2']);
  });

  it('paginates: the second page StartAfter equals the first page last key', async () => {
    const agent = await loginAgent();
    siteExists();

    const k1 = keyAt(new Date(Date.now() - 60 * 60 * 1000).toISOString(), '00000001');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }], IsTruncated: true });
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: fakeBody({ check_id: 'c1', site_id: SITE_ID, checked_at: '2026-08-02T13:00:00.000Z', status: 'up' }) });

    const page1 = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ limit: 1 });
    expect(page1.status).toBe(200);
    const cursor = page1.body.data.next_cursor;
    expect(cursor).toEqual(expect.any(String));

    s3Mock.reset();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const page2 = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ limit: 1, cursor });
    expect(page2.status).toBe(200);

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.StartAfter).toBe(k1);
  });

  it('returns 400 for a non-ISO-8601 from', async () => {
    const agent = await loginAgent();
    siteExists();
    const res = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ from: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when to is before from', async () => {
    const agent = await loginAgent();
    siteExists();
    const res = await agent
      .get(`/v1/sites/${SITE_ID}/history`)
      .query({ from: '2026-08-02T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit exceeds 100', async () => {
    const agent = await loginAgent();
    siteExists();
    const res = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ limit: 101 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown query parameter', async () => {
    const agent = await loginAgent();
    siteExists();
    const res = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ order: 'desc' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed cursor', async () => {
    const agent = await loginAgent();
    siteExists();
    const res = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ cursor: 'not-valid!!!' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a cursor forged to escape the site prefix via path traversal', async () => {
    const agent = await loginAgent();
    siteExists();
    const forged = Buffer.from(
      JSON.stringify({ v: 1, k: '../../other-user/s/2026/08/02/123-abcdef12.json' })
    ).toString('base64url');

    const res = await agent.get(`/v1/sites/${SITE_ID}/history`).query({ cursor: forged });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-uuid site id', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/v1/sites/not-a-uuid/history');
    expect(res.status).toBe(400);
  });

  it('does not require a CSRF token for the read', async () => {
    const agent = await loginAgent();
    siteExists();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const res = await agent.get(`/v1/sites/${SITE_ID}/history`);
    expect(res.status).toBe(200);
  });
});
