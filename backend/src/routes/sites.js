const express = require('express');
const siteService = require('../services/siteService');
const historyService = require('../services/historyService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { createSiteSchema, updateSiteSchema, siteIdParamSchema } = require('../schemas/siteSchemas');
const { historyQuerySchema } = require('../schemas/historySchemas');

const router = express.Router();

router.post('/v1/sites', requireAuth, doubleCsrfProtection, validate(createSiteSchema), async (req, res, next) => {
  try {
    const site = await siteService.createSite(req.session.user_id, req.validated);
    res.status(201).json({ success: true, data: site, error: null });
  } catch (error) {
    next(error);
  }
});

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
