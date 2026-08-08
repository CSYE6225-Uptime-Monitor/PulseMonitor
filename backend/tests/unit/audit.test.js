jest.mock('../../src/services/auditService');

const express = require('express');
const request = require('supertest');
const auditService = require('../../src/services/auditService');
const audit = require('../../src/middleware/audit');

function buildApp({ withSession = true, sessionNulledInHandler = false } = {}) {
  const app = express();
  app.use((req, res, next) => {
    if (withSession) {
      req.session = { user_id: 'u1', email: 'jane@example.com' };
    }
    next();
  });

  app.get(
    '/resource/:id',
    audit({ eventType: 'resource.viewed', resourceType: 'resource' }),
    (req, res) => {
      if (sessionNulledInHandler) {
        req.session = null;
      }
      res.status(200).json({ ok: true });
    }
  );

  app.post(
    '/resource',
    audit({ eventType: 'resource.created', resourceType: 'resource' }),
    (req, res) => {
      res.locals.audit = { resource_id: 'generated-id' };
      res.status(201).json({ ok: true });
    }
  );

  app.get(
    '/failing/:id',
    audit({ eventType: 'resource.failed', resourceType: 'resource' }),
    (req, res) => {
      res.status(404).json({ ok: false });
    }
  );

  app.get(
    '/blocked-before-audit/:id',
    (req, res, next) => {
      // Simulates validate.js / CSRF short-circuiting before audit() is reached.
      res.status(400).json({ ok: false });
    },
    audit({ eventType: 'resource.never', resourceType: 'resource' }),
    (req, res) => {
      res.status(200).json({ ok: true });
    }
  );

  return app;
}

describe('audit middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responds before the audit write resolves (deferred-promise ordering)', async () => {
    let resolveRecord;
    auditService.record.mockReturnValue(
      new Promise((resolve) => {
        resolveRecord = resolve;
      })
    );

    const app = buildApp();
    const res = await request(app).get('/resource/r1');

    expect(res.status).toBe(200);
    expect(auditService.record).toHaveBeenCalledTimes(1);
    resolveRecord();
  });

  it('does not affect the response even when auditService.record rejects', async () => {
    auditService.record.mockRejectedValue(new Error('boom'));

    const app = buildApp();
    const res = await request(app).post('/resource');

    expect(res.status).toBe(201);
  });

  it('uses res.locals.audit.resource_id when the handler sets it (create case)', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp();
    await request(app).post('/resource');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ resource_id: 'generated-id' }));
  });

  it('defaults resource_id to req.params.id when the handler sets nothing', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp();
    await request(app).get('/resource/r42');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ resource_id: 'r42' }));
  });

  it('records outcome failure for a 4xx response', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp();
    await request(app).get('/failing/r1');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', status_code: 404 }));
  });

  it('records outcome success for a 2xx response', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp();
    await request(app).get('/resource/r1');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', status_code: 200 }));
  });

  it('records nothing when an earlier middleware short-circuits before audit() runs', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp();
    const res = await request(app).get('/blocked-before-audit/r1');

    expect(res.status).toBe(400);
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('snapshots the session before the handler runs, so a handler that nulls req.session still records user_id', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp({ sessionNulledInHandler: true });
    await request(app).get('/resource/r1');

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', actor_email: 'jane@example.com' })
    );
  });

  it('records a null user_id when there is no session', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = buildApp({ withSession: false });
    await request(app).get('/resource/r1');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ user_id: null, actor_email: null }));
  });

  it('lets res.locals.audit override user_id (the login case)', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = express();
    app.get('/login-like', audit({ eventType: 'auth.login.succeeded' }), (req, res) => {
      res.locals.audit = { user_id: 'freshly-logged-in-id' };
      res.status(200).json({ ok: true });
    });

    await request(app).get('/login-like');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'freshly-logged-in-id' }));
  });

  it('lets res.locals.audit override event_type (the failed-login case)', async () => {
    auditService.record.mockResolvedValue(undefined);

    const app = express();
    app.get('/login-like-failed', audit({ eventType: 'auth.login.succeeded' }), (req, res) => {
      res.locals.audit = { event_type: 'auth.login.failed' };
      res.status(401).json({ ok: false });
    });

    await request(app).get('/login-like-failed');

    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'auth.login.failed' }));
  });
});
