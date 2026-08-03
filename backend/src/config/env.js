const REQUIRED = ['SESSION_SECRET', 'USERS_TABLE', 'AWS_REGION', 'SITES_TABLE', 'HISTORY_BUCKET'];

function readEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    port: Number(process.env.PORT) || 8080,
    nodeEnv,
    // Decoupled from nodeEnv: the ALB terminates only HTTP until the DNS/ACM
    // module lands, so a "production" deploy still needs secure=false cookies
    // for a while. Flipping this to true is a one-variable change once HTTPS
    // is live - see infrastructure/modules/compute's certificate_arn wiring.
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
    sessionSecret: process.env.SESSION_SECRET,
    usersTable: process.env.USERS_TABLE,
    sitesTable: process.env.SITES_TABLE,
    awsRegion: process.env.AWS_REGION,
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
    historyBucket: process.env.HISTORY_BUCKET,
    historyPrefix: process.env.HISTORY_PREFIX || 'sites',
    s3Endpoint: process.env.S3_ENDPOINT,
  };
}

module.exports = readEnv();
