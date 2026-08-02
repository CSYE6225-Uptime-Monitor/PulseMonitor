const { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../db/dynamo');
const config = require('../config/env');
const AppError = require('../errors/AppError');

async function create(site) {
  try {
    await docClient.send(
      new PutCommand({
        TableName: config.sitesTable,
        Item: site,
        ConditionExpression: 'attribute_not_exists(site_id)',
      })
    );
    return site;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new AppError(409, 'Site already exists.');
    }
    throw error;
  }
}

async function findById(userId, siteId) {
  const result = await docClient.send(
    new GetCommand({ TableName: config.sitesTable, Key: { user_id: userId, site_id: siteId } })
  );
  return result.Item ?? null;
}

async function listByUser(userId) {
  const sites = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: config.sitesTable,
        KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: { ':user_id': userId },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    sites.push(...(page.Items || []));
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return sites;
}

// Every provided field is aliased through #key (same generic loop as
// userRepository.update), which covers reserved words (url, name, status)
// for free. Absent fields are never named, so pinger-written attributes
// (status, checked_at, latency_ms, ...) survive an update untouched.
async function update(userId, siteId, updates) {
  const now = new Date().toISOString();
  const names = { '#updated_at': 'updated_at' };
  const values = { ':updated_at': now };
  const sets = ['#updated_at = :updated_at'];

  for (const [key, value] of Object.entries(updates)) {
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: config.sitesTable,
        Key: { user_id: userId, site_id: siteId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(site_id)',
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new AppError(404, 'Site not found.');
    }
    throw error;
  }
}

async function remove(userId, siteId) {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: config.sitesTable,
        Key: { user_id: userId, site_id: siteId },
        ConditionExpression: 'attribute_exists(site_id)',
      })
    );
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new AppError(404, 'Site not found.');
    }
    throw error;
  }
}

module.exports = { create, findById, listByUser, update, remove };
