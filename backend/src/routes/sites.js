const express = require('express');
const siteService = require('../services/siteService');
const historyService = require('../services/historyService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const audit = require('../middleware/audit');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { createSiteSchema, updateSiteSchema, siteIdParamSchema } = require('../schemas/siteSchemas');
const { historyQuerySchema } = require('../schemas/historySchemas');
const { AUDIT_EVENTS } = require('../utils/auditEvents');

const router = express.Router();

router.post(
  '/v1/sites',
  requireAuth,
  doubleCsrfProtection,
  validate(createSiteSchema),
  audit({ eventType: AUDIT_EVENTS.SITE_CREATED, resourceType: 'site' }),
  async (req, res, next) => {
    try {
      const site = await siteService.createSite(req.session.user_id, req.validated);
      // The site_id is only known after creation, so it must be supplied
      // here - the default req.params.id extraction has nothing to read on
      // a POST to the collection endpoint.
      res.locals.audit = { resource_id: site.site_id };
      res.status(201).json({ success: true, data: site, error: null });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/v1/sites', requireAuth, async (req, res, next) => {
  try {
    const sites = await siteService.listSites(req.session.user_id);
    res.json({ success: true, data: { sites }, error: null });
  } catch (error) {
    next(error);
  }
});

router.get('/v1/sites/:id', requireAuth, validate(siteIdParamSchema, 'params'), async (req, res, next) => {
  try {
    const site = await siteService.getSite(req.session.user_id, req.validatedParams.id);
    res.json({ success: true, data: site, error: null });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/v1/sites/:id',
  requireAuth,
  validate(siteIdParamSchema, 'params'),
  doubleCsrfProtection,
  validate(updateSiteSchema),
  audit({ eventType: AUDIT_EVENTS.SITE_UPDATED, resourceType: 'site' }),
  async (req, res, next) => {
    try {
      const site = await siteService.updateSite(req.session.user_id, req.validatedParams.id, req.validated);
      res.json({ success: true, data: site, error: null });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/v1/sites/:id',
  requireAuth,
  validate(siteIdParamSchema, 'params'),
  doubleCsrfProtection,
  audit({ eventType: AUDIT_EVENTS.SITE_DELETED, resourceType: 'site' }),
  async (req, res, next) => {
    try {
      await siteService.deleteSite(req.session.user_id, req.validatedParams.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

router.get('/v1/sites/:id/status', requireAuth, validate(siteIdParamSchema, 'params'), async (req, res, next) => {
  try {
    const status = await siteService.getSiteStatus(req.session.user_id, req.validatedParams.id);
    res.json({ success: true, data: status, error: null });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/v1/sites/:id/history',
  requireAuth,
  validate(siteIdParamSchema, 'params'),
  validate(historyQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const history = await historyService.getHistory(req.session.user_id, req.validatedParams.id, req.validatedQuery);
      res.json({ success: true, data: history, error: null });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
