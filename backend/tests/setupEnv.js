process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production-use';
process.env.USERS_TABLE = 'pulsemonitor-test-users';
process.env.SITES_TABLE = 'pulsemonitor-test-sites';
process.env.AWS_REGION = 'us-east-1';
process.env.HISTORY_BUCKET = 'pulsemonitor-test-history';
process.env.USER_DATA_BUCKET = 'pulsemonitor-test-user-data';
process.env.AUDIT_BUCKET = 'pulsemonitor-test-audit-logs';
// getSignedUrl signs locally from resolved credentials and never goes through
// the mockable command-send path, so it needs *something* to resolve rather
// than falling through to the shared-config/IMDS chain in CI.
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
