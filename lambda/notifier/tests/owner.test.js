const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { resolveOwnerEmail } = require('../lib/owner');

function docClientMock() {
  return mockClient(DynamoDBDocumentClient);
}

describe('resolveOwnerEmail', () => {
  it('issues a Query against the user_id-index, never a Scan', async () => {
    const ddb = docClientMock();
    ddb.on(QueryCommand).resolves({ Items: [{ email: 'owner@example.com', user_id: 'u1' }], Count: 1 });

    await resolveOwnerEmail(ddb, 'pulsemonitor-dev-users', 'user_id-index', 'u1');

    expect(ddb.commandCalls(ScanCommand)).toHaveLength(0);
    const call = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(call.TableName).toBe('pulsemonitor-dev-users');
    expect(call.IndexName).toBe('user_id-index');
    expect(call.KeyConditionExpression).toBe('user_id = :user_id');
    expect(call.ExpressionAttributeValues).toEqual({ ':user_id': 'u1' });
  });

  it('returns the email when exactly one match is found', async () => {
    const ddb = docClientMock();
    ddb.on(QueryCommand).resolves({ Items: [{ email: 'owner@example.com', user_id: 'u1' }], Count: 1 });

    const email = await resolveOwnerEmail(ddb, 'pulsemonitor-dev-users', 'user_id-index', 'u1');

    expect(email).toBe('owner@example.com');
  });

  it('returns null when no match is found (sparse GSI - legacy user with no user_id)', async () => {
    const ddb = docClientMock();
    ddb.on(QueryCommand).resolves({ Items: [], Count: 0 });

    const email = await resolveOwnerEmail(ddb, 'pulsemonitor-dev-users', 'user_id-index', 'u1');

    expect(email).toBeNull();
  });

  it('returns the first email and does not throw when more than one match is found', async () => {
    const ddb = docClientMock();
    ddb.on(QueryCommand).resolves({
      Items: [
        { email: 'first@example.com', user_id: 'u1' },
        { email: 'second@example.com', user_id: 'u1' },
      ],
      Count: 2,
    });

    const email = await resolveOwnerEmail(ddb, 'pulsemonitor-dev-users', 'user_id-index', 'u1');

    expect(email).toBe('first@example.com');
  });
});
