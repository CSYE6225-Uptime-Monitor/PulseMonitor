const request = require('supertest');
const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');

const { docClient } = require('../../src/db/dynamo');
const app = require('../../src/app');

const ddbMock = mockClient(docClient);

async function getCsrfToken(agent) {
  const res = await agent.get('/v1/csrf-token');
  return res.body.data.csrfToken;
}

describe('user account API', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('creates a user and never returns the password hash', async () => {
    ddbMock.on(PutCommand).resolves({});

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/user')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'supersecret', first_name: 'Jane', last_name: 'Doe' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('jane@example.com');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('rejects duplicate emails with 409', async () => {
    const conditionalError = new Error('duplicate');
    conditionalError.name = 'ConditionalCheckFailedException';
    ddbMock.on(PutCommand).rejects(conditionalError);

    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/user')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'supersecret', first_name: 'Jane', last_name: 'Doe' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects unknown fields with 400', async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/user')
      .set('x-csrf-token', csrfToken)
      .send({
        email: 'jane@example.com',
        password: 'supersecret',
        first_name: 'Jane',
        last_name: 'Doe',
        isAdmin: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects short passwords with 400', async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/v1/user')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'jane@example.com', password: 'short', first_name: 'Jane', last_name: 'Doe' });

    expect(res.status).toBe(400);
  });

  it('returns 401 for self without a session', async () => {
    const res = await request(app).get('/v1/user/self');
    expect(res.status).toBe(401);
  });

  it('returns self and allows updates for an authenticated user', async () => {
    const passwordHash = await bcrypt.hash('supersecret', 4);

    ddbMock.on(GetCommand).resolves({
      Item: {
        email: 'jane@example.com',
        user_id: '55555555-5555-4555-8555-555555555555',
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

    const selfRes = await agent.get('/v1/user/self');
    expect(selfRes.status).toBe(200);
    expect(selfRes.body.data.email).toBe('jane@example.com');
    expect(selfRes.body.data).not.toHaveProperty('password_hash');

    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        email: 'jane@example.com',
        password_hash: passwordHash,
        first_name: 'Janet',
        last_name: 'Doe',
      },
    });

    const updateRes = await agent.put('/v1/user/self').set('x-csrf-token', csrfToken).send({ first_name: 'Janet' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.first_name).toBe('Janet');
  });

  it('scopes self to the session email, ignoring any email in the request body', async () => {
    const passwordHash = await bcrypt.hash('supersecret', 4);
    ddbMock.on(GetCommand).resolves({
      Item: {
        email: 'jane@example.com',
        user_id: '66666666-6666-4666-8666-666666666666',
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

    const res = await agent
      .put('/v1/user/self')
      .set('x-csrf-token', csrfToken)
      .send({ first_name: 'Janet', email: 'someoneelse@example.com' });

    expect(res.status).toBe(400);
  });
});
