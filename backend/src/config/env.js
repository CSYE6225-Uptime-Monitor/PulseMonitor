const REQUIRED = ['SESSION_SECRET', 'USERS_TABLE', 'AWS_REGION'];

function readEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(process.env.PORT) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET,
    usersTable: process.env.USERS_TABLE,
    awsRegion: process.env.AWS_REGION,
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
  };
}

module.exports = readEnv();
