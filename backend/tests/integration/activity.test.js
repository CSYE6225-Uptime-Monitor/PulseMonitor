const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');
const { prefixFor, buildKey } = require('../../src/utils/auditKeys');
const config = require('../../src/config/env');

const ddbMock = mockClient(docClient);
const s3Mock = mockClient(s3Client);

const USERS_TABLE = 'pulsemonitor-test-users';
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

  return agent;
}

function keyAt(isoString, eventId8 = 'abcdef12') {
  return buildKey(config.auditPrefix, USER_ID, new Date(isoString).getTime(), eventId8);
}

function fakeBody(obj) {
  return { transformToString: async () => JSON.stringify(obj) };
}

describe('GET /v1/user/self/activity', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/v1/user/self/activity');
    expect(res.status).toBe(401);
  });

  it('returns an empty events array and null next_cursor when there is no activity', async () => {
    const agent = await loginAgent();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const res = await agent.get('/v1/user/self/activity');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ events: [], next_cursor: null });
  });

  it('lists events for the happy path', async () => {
    const agent = await loginAgent();
    const k1 = keyAt('2026-08-02T13:00:00.000Z', '00000001');
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }], IsTruncated: false });
    s3Mock.on(GetObjectCommand, { Key: k1 }).resolves({
      Body: fakeBody({
        event_id: 'e1',
        event_type: 'site.created',
        occurred_at: '2026-08-02T13:00:00.000Z',
        resource_type: 'site',
        resource_id: 's1',
        outcome: 'success',
      }),
    });

    const res = await agent.get('/v1/user/self/activity');

    expect(res.status).toBe(200);
    expect(res.body.data.events).toEqual([
      {
        event_id: 'e1',
        event_type: 'site.created',
        occurred_at: '2026-08-02T13:00:00.000Z',
        resource_type: 'site',
        resource_id: 's1',
        outcome: 'success',
      },
    ]);
  });

  it('always scopes the S3 Prefix to audit/{USER_ID}/', async () => {
    const agent = await loginAgent();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    await agent.get('/v1/user/self/activity');

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.Prefix).toBe(prefixFor(config.auditPrefix, USER_ID));
  });

  it('paginates: the second page StartAfter equals the first page last key', async () => {
    const agent = await loginAgent();
    const k1 = keyAt('2026-08-02T13:00:00.000Z', '00000001');

    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: k1 }], IsTruncated: true });
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: fakeBody({ event_id: 'e1', event_type: 'site.created', occurred_at: '2026-08-02T13:00:00.000Z' }) });

    const page1 = await agent.get('/v1/user/self/activity').query({ limit: 1 });
    expect(page1.status).toBe(200);
    const cursor = page1.body.data.next_cursor;
    expect(cursor).toEqual(expect.any(String));

    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const page2 = await agent.get('/v1/user/self/activity').query({ limit: 1, cursor });
    expect(page2.status).toBe(200);

    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.StartAfter).toBe(k1);
  });

  it('returns 400 for a limit over 100', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/v1/user/self/activity').query({ limit: 101 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown query parameter', async () => {
    const agent = await loginAgent();
    const res = await agent.get('/v1/user/self/activity').query({ order: 'desc' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a cursor forged to escape the user prefix via path traversal', async () => {
    const agent = await loginAgent();
    const forged = Buffer.from(
      JSON.stringify({ v: 1, k: '../../other-user/2026/08/02/123-abcdef12.json' })
    ).toString('base64url');

    const res = await agent.get('/v1/user/self/activity').query({ cursor: forged });
    expect(res.status).toBe(400);
  });

  it('does not require a CSRF token for the read', async () => {
    const agent = await loginAgent();
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    const res = await agent.get('/v1/user/self/activity');
    expect(res.status).toBe(200);
  });
});
