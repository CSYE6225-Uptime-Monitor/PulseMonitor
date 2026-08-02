const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const { docClient } = require('../../src/db/dynamo');
const userRepository = require('../../src/repositories/userRepository');
const AppError = require('../../src/errors/AppError');

const ddbMock = mockClient(docClient);

describe('userRepository', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('findByEmail', () => {
    it('returns null when no item is found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      const result = await userRepository.findByEmail('missing@example.com');
      expect(result).toBeNull();
    });

    it('returns the item when found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { email: 'jane@example.com' } });
      const result = await userRepository.findByEmail('jane@example.com');
      expect(result).toEqual({ email: 'jane@example.com' });
    });
  });

  describe('create', () => {
    it('puts the item with a conditional expression preventing overwrites', async () => {
      ddbMock.on(PutCommand).resolves({});
      const user = { email: 'jane@example.com', password_hash: 'hash' };
      const result = await userRepository.create(user);

      expect(result).toEqual(user);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(email)');
    });

    it('throws a 409 AppError when the email already exists', async () => {
      const conditionalError = new Error('duplicate');
      conditionalError.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(conditionalError);

      await expect(userRepository.create({ email: 'jane@example.com' })).rejects.toBeInstanceOf(AppError);
      await expect(userRepository.create({ email: 'jane@example.com' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rethrows unrelated errors', async () => {
      ddbMock.on(PutCommand).rejects(new Error('network blip'));
      await expect(userRepository.create({ email: 'jane@example.com' })).rejects.toThrow('network blip');
    });
  });

  describe('update', () => {
    it('builds an UpdateExpression from the given fields and returns the new attributes', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { email: 'jane@example.com', first_name: 'Janet' },
      });

      const result = await userRepository.update('jane@example.com', { first_name: 'Janet' });

      expect(result).toEqual({ email: 'jane@example.com', first_name: 'Janet' });
      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#first_name = :first_name');
    });
  });
});
