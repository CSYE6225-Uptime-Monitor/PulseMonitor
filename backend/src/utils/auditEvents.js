// Frozen so a typo in an event-type string is a load-time error, not a
// silently-wrong event that never shows up in anyone's activity feed.
const AUDIT_EVENTS = Object.freeze({
  AUTH_LOGIN_SUCCEEDED: 'auth.login.succeeded',
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_LOGOUT: 'auth.logout',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_EXPORT_REQUESTED: 'user.export.requested',
  USER_EXPORT_DOWNLOADED: 'user.export.downloaded',
  SITE_CREATED: 'site.created',
  SITE_UPDATED: 'site.updated',
  SITE_DELETED: 'site.deleted',
});

module.exports = { AUDIT_EVENTS };
