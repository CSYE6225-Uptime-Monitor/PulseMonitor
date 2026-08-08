const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const { s3Client } = require('../../src/db/s3');
const app = require('../../src/app');
const config = require('../../src/config/env');

const ddbMock = mockClient(docClient);
const s3Mock = mockClient(s3Client);

const USERS_TABLE = 'pulsemonitor-test-users';
const SITES_TABLE = 'pulsemonitor-test-sites';
const USER_ID = '11111111-1111-4111-8111-111111111111';

// The audit write is floated (res.on('finish'), never awaited by the
// request/response cycle), so a supertest response resolving is not proof
// the write has happened yet - poll instead of asserting immediately.
async function waitFor(predicate, { attempts = 50, delayMs = 5 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('condition was not met in time');
}

function auditEventsWritten() {
  return s3Mock
    .commandCalls(PutObjectCommand)
    .filter((call) => call.args[0].input.Bucket === config.auditBucket)
    .map((call) => JSON.parse(call.args[0].input.Body));
}

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
  await waitFor(() => auditEventsWritten().some((e) => e.event_type === 'auth.login.succeeded'));

  return { agent, csrfToken };
}

describe('audit writes on mutating routes', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
  });

  it('writes exactly one site.created event carrying the new site_id', async () => {
    const { agent, csrfToken } = await loginAgent();
    ddbMock.on(PutCommand, { TableName: SITES_TABLE }).resolves({});

    const res = await agent
      .post('/v1/sites')
      .set('x-csrf-token', csrfToken)
      .send({ url: 'https://example.com', name: 'My Site' });

    expect(res.status).toBe(201);
    const siteId = res.body.data.site_id;

    await waitFor(() => auditEventsWritten().some((e) => e.event_type === 'site.created'));

    const siteCreatedEvents = auditEventsWritten().filter((e) => e.event_type === 'site.created');
    expect(siteCreatedEvents).toHaveLength(1);
    expect(siteCreatedEvents[0].resource_id).toBe(siteId);
    expect(siteCreatedEvents[0].outcome).toBe('success');
    expect(siteCreatedEvents[0].user_id).toBe(USER_ID);
  });

  it('writes an auth.login.failed event for bad credentials', async () => {
    ddbMock.on(GetCommand, { TableName: USERS_TABLE }).resolves({ Item: undefined });

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'nobody@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    await waitFor(() => auditEventsWritten().some((e) => e.event_type === 'auth.login.failed'));

    const failedEvents = auditEventsWritten().filter((e) => e.event_type === 'auth.login.failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].outcome).toBe('failure');
  });

  it('writes zero audit events for a CSRF-rejected request', async () => {
    const { agent } = await loginAgent();
    const before = auditEventsWritten().length;

    const res = await agent.post('/v1/sites').send({ url: 'https://example.com', name: 'x' });
    expect(res.status).toBe(403);

    // No timer/promise is ever scheduled for a CSRF rejection (audit() sits
    // after doubleCsrfProtection in the route chain, so it never runs) -
    // a short settle is enough to prove nothing shows up, not a race.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(auditEventsWritten()).toHaveLength(before);
  });
});
