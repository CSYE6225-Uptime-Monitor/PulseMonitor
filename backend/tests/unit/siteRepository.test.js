const { mockClient } = require('aws-sdk-client-mock');
const { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const { docClient } = require('../../src/db/dynamo');
const siteRepository = require('../../src/repositories/siteRepository');
const AppError = require('../../src/errors/AppError');

const ddbMock = mockClient(docClient);

describe('siteRepository', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('create', () => {
    it('puts the item under a conditional expression preventing overwrites', async () => {
      ddbMock.on(PutCommand).resolves({});
      const site = { user_id: 'u1', site_id: 's1', url: 'https://example.com', name: 'x' };
      const result = await siteRepository.create(site);

      expect(result).toEqual(site);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(site_id)');
    });

    it('maps ConditionalCheckFailedException to a 409 AppError', async () => {
      const err = new Error('duplicate');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(err);

      await expect(siteRepository.create({ user_id: 'u1', site_id: 's1' })).rejects.toBeInstanceOf(AppError);
      await expect(siteRepository.create({ user_id: 'u1', site_id: 's1' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rethrows unrelated errors', async () => {
      ddbMock.on(PutCommand).rejects(new Error('network blip'));
      await expect(siteRepository.create({ user_id: 'u1', site_id: 's1' })).rejects.toThrow('network blip');
    });
  });

  describe('findById', () => {
    it('reads by the composite key', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { user_id: 'u1', site_id: 's1' } });
      const result = await siteRepository.findById('u1', 's1');

      expect(result).toEqual({ user_id: 'u1', site_id: 's1' });
      const call = ddbMock.commandCalls(GetCommand)[0];
      expect(call.args[0].input.Key).toEqual({ user_id: 'u1', site_id: 's1' });
    });

    it('returns null when absent', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });
      const result = await siteRepository.findById('u1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('issues a Query keyed on user_id', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [{ user_id: 'u1', site_id: 's1' }] });
      const result = await siteRepository.listByUser('u1');

      expect(result).toEqual([{ user_id: 'u1', site_id: 's1' }]);
      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.KeyConditionExpression).toBe('user_id = :user_id');
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':user_id': 'u1' });
    });

    it('never issues a Scan', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await siteRepository.listByUser('u1');
      expect(ddbMock.commandCalls(ScanCommand)).toHaveLength(0);
    });

    it('follows LastEvaluatedKey until exhausted', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [{ user_id: 'u1', site_id: 's1' }], LastEvaluatedKey: { site_id: 's1' } })
        .resolvesOnce({ Items: [{ user_id: 'u1', site_id: 's2' }] });

      const result = await siteRepository.listByUser('u1');

      expect(result).toEqual([
        { user_id: 'u1', site_id: 's1' },
        { user_id: 'u1', site_id: 's2' },
      ]);
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
      expect(ddbMock.commandCalls(QueryCommand)[1].args[0].input.ExclusiveStartKey).toEqual({ site_id: 's1' });
    });

    it('returns an empty array for a user with no sites', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const result = await siteRepository.listByUser('u1');
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('sets only the provided fields', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: 'u1', site_id: 's1', name: 'new-name' } });
      await siteRepository.update('u1', 's1', { name: 'new-name' });

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#name = :name');
      expect(call.args[0].input.UpdateExpression).not.toMatch(/#url|#enabled|#check_frequency_minutes/);
    });

    it('never names the pinger-written status attributes', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: {} });
      await siteRepository.update('u1', 's1', { name: 'new-name' });

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      const aliasedFields = Object.values(call.args[0].input.ExpressionAttributeNames);
      expect(aliasedFields).not.toContain('status');
      expect(aliasedFields).not.toContain('checked_at');
      expect(aliasedFields).not.toContain('latency_ms');
      expect(aliasedFields).not.toContain('consecutive_failures');
    });

    it('aliases the reserved words url and name', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: {} });
      await siteRepository.update('u1', 's1', { url: 'https://example.com', name: 'x' });

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ExpressionAttributeNames['#url']).toBe('url');
      expect(call.args[0].input.ExpressionAttributeNames['#name']).toBe('name');
    });

    it('is conditioned on attribute_exists(site_id)', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: {} });
      await siteRepository.update('u1', 's1', { name: 'x' });

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(site_id)');
    });

    it('maps ConditionalCheckFailedException to a 404 AppError', async () => {
      const err = new Error('missing');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(err);

      await expect(siteRepository.update('u1', 's1', { name: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns ALL_NEW attributes', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { user_id: 'u1', site_id: 's1', name: 'x' } });
      const result = await siteRepository.update('u1', 's1', { name: 'x' });

      expect(result).toEqual({ user_id: 'u1', site_id: 's1', name: 'x' });
      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ReturnValues).toBe('ALL_NEW');
    });
  });

  describe('remove', () => {
    it('deletes by composite key under attribute_exists(site_id)', async () => {
      ddbMock.on(DeleteCommand).resolves({});
      await siteRepository.remove('u1', 's1');

      const call = ddbMock.commandCalls(DeleteCommand)[0];
      expect(call.args[0].input.Key).toEqual({ user_id: 'u1', site_id: 's1' });
      expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(site_id)');
    });

    it('maps ConditionalCheckFailedException to a 404 AppError', async () => {
      const err = new Error('missing');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(DeleteCommand).rejects(err);

      await expect(siteRepository.remove('u1', 's1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rethrows unrelated errors', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('network blip'));
      await expect(siteRepository.remove('u1', 's1')).rejects.toThrow('network blip');
    });
  });
});
