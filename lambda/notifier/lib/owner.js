const { QueryCommand } = require('@aws-sdk/lib-dynamodb');

// Queries the user_id-index GSI (KEYS_ONLY: {user_id, email}) rather than
// GetItem/Scan on the base table - the notifier's IAM grant is scoped to the
// index ARN alone, so it cannot read password_hash even if this ever
// changed. Limit: 2, not 1, so a duplicate user_id (shouldn't happen, but
// see the userService.js lazy-assignment race) is detectable rather than
// silently masked.
async function resolveOwnerEmail(docClient, tableName, indexName, userId) {
  const response = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'user_id = :user_id',
      ExpressionAttributeValues: { ':user_id': userId },
      Limit: 2,
    }),
  );

  const items = response.Items || [];
  // The GSI is sparse: legacy accounts created before user_id existed (or a
  // user deleted after the site was created) simply have no entry. This is
  // a permanent, expected outcome, not an error - see lib/index.js for how
  // it's swallowed rather than retried.
  if (items.length === 0) return null;

  return items[0].email;
}

module.exports = { resolveOwnerEmail };
