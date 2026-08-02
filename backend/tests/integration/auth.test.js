const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const app = require('../../src/app');

const ddbMock = mockClient(docClient);

async function getCsrfToken(agent) {
  const res = await agent.get('/v1/csrf-token');
  return res.body.data.csrfToken;
}

describe('auth flow', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('issues a csrf token', async () => {
    const res = await request(app).get('/v1/csrf-token');
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
  });

  it('rejects invalid credentials with 401', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects mutating requests without a CSRF token', async () => {
    const res = await request(app).post('/v1/login').send({ email: 'jane@example.com', password: 'whatever' });

    expect(res.status).toBe(403);
  });

  it('logs the user out and clears the session', async () => {
    const passwordHash = await bcrypt.hash('supersecret', 4);
    ddbMock.on(GetCommand).resolves({
      Item: {
        email: 'jane@example.com',
        user_id: '11111111-1111-4111-8111-111111111111',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    await agent
      .post('/v1/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'supersecret' });

    const logoutRes = await agent.post('/v1/logout').set('x-csrf-token', csrfToken);
    expect(logoutRes.status).toBe(200);

    const selfRes = await agent.get('/v1/user/self');
    expect(selfRes.status).toBe(401);
  });

  it('includes user_id in the login response and stores it in the session', async () => {
    const passwordHash = await bcrypt.hash('supersecret', 4);
    ddbMock.on(GetCommand).resolves({
      Item: {
        email: 'jane@example.com',
        user_id: '22222222-2222-4222-8222-222222222222',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const loginRes = await agent
      .post('/v1/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'supersecret' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user_id).toBe('22222222-2222-4222-8222-222222222222');

    // requireAuth now demands both email and user_id on the session, so a 200
    // here (not 401) proves user_id actually made it into the session cookie.
    const selfRes = await agent.get('/v1/user/self');
    expect(selfRes.status).toBe(200);
    expect(selfRes.body.data.user_id).toBe('22222222-2222-4222-8222-222222222222');
  });
});
