const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('../db/dynamo');
const config = require('../config/env');
const AppError = require('../errors/AppError');

async function findByEmail(email) {
  const result = await docClient.send(new GetCommand({ TableName: config.usersTable, Key: { email } }));
  return result.Item ?? null;
}

async function create(user) {
  try {
    await docClient.send(
      new PutCommand({
        TableName: config.usersTable,
        Item: user,
        ConditionExpression: 'attribute_not_exists(email)',
      })
    );
    return user;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new AppError(409, 'An account with this email already exists.');
    }
    throw error;
  }
}

async function update(email, updates) {
  const now = new Date().toISOString();
  const names = { '#updated_at': 'updated_at' };
  const values = { ':updated_at': now };
  const sets = ['#updated_at = :updated_at'];

  for (const [key, value] of Object.entries(updates)) {
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: config.usersTable,
      Key: { email },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes;
}

module.exports = { findByEmail, create, update };
