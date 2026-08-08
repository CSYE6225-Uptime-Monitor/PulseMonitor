const auditService = require('../services/auditService');

// A route-level factory, not a global middleware: mount order determines
// what gets audited. Placing audit(...) after validate()/doubleCsrfProtection
// means a 400/403 from those never reaches here, so it is never recorded -
// that's deliberate, not an oversight. Because the finish hook is registered
// on the response object itself, it fires regardless of whether the route
// handler or the global error handler is what eventually completes the
// response, so a thrown AppError is captured with the same fidelity as a
// normal 2xx.
function audit({ eventType, resourceType = null }) {
  return function auditMiddleware(req, res, next) {
    // Snapshot before next(): a handler is allowed to mutate or null
    // req.session (POST /v1/logout sets it to null) before the response
    // finishes, and the 'finish' event fires after that mutation - reading
    // the live session at that point would silently drop user_id from every
    // logout event.
    const sessionSnapshot = req.session
      ? { user_id: req.session.user_id ?? null, email: req.session.email ?? null }
      : { user_id: null, email: null };

    res.on('finish', () => {
      const outcome = res.statusCode < 400 ? 'success' : 'failure';
      const override = res.locals.audit ?? {};

      // auditService.record is contractually non-throwing (it catches its
      // own S3 failures), but the response has already been sent by the time
      // this fires either way - the .catch here is defense-in-depth against
      // an unhandled rejection, not a guard this code relies on.
      res.locals.auditWritePromise = auditService
        .record({
          user_id: override.user_id ?? sessionSnapshot.user_id,
          actor_email: override.actor_email ?? sessionSnapshot.email,
          event_type: override.event_type ?? eventType,
          outcome,
          resource_type: resourceType,
          resource_id: override.resource_id ?? req.params?.id ?? null,
          method: req.method,
          path: req.originalUrl ? req.originalUrl.split('?')[0] : req.path,
          status_code: res.statusCode,
          ip: req.ip,
          user_agent: req.get('user-agent') || null,
          metadata: override.metadata ?? {},
        })
        .catch(() => {});
    });

    next();
  };
}

module.exports = audit;
