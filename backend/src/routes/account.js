const express = require('express');
const auditService = require('../services/auditService');
const exportService = require('../services/exportService');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const audit = require('../middleware/audit');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { AUDIT_EVENTS } = require('../utils/auditEvents');
const { activityQuerySchema } = require('../schemas/auditSchemas');
const { exportIdParamSchema } = require('../schemas/exportSchemas');

const router = express.Router();

router.get('/v1/user/self/activity', requireAuth, validate(activityQuerySchema, 'query'), async (req, res, next) => {
  try {
    const activity = await auditService.listActivity(req.session.user_id, req.validatedQuery);
    res.json({ success: true, data: activity, error: null });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/v1/user/self/exports',
  requireAuth,
  doubleCsrfProtection,
  audit({ eventType: AUDIT_EVENTS.USER_EXPORT_REQUESTED, resourceType: 'export' }),
  async (req, res, next) => {
    try {
      const result = await exportService.createExport(req.session.user_id, req.session.email);
      res.locals.audit = { resource_id: result.export_id };
      res.status(201).json({ success: true, data: result, error: null });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/v1/user/self/exports', requireAuth, async (req, res, next) => {
  try {
    const exports = await exportService.listExports(req.session.user_id);
    res.json({ success: true, data: { exports }, error: null });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/v1/user/self/exports/:id/download',
  requireAuth,
  validate(exportIdParamSchema, 'params'),
  audit({ eventType: AUDIT_EVENTS.USER_EXPORT_DOWNLOADED, resourceType: 'export' }),
  async (req, res, next) => {
    try {
      const download = await exportService.getDownloadUrl(req.session.user_id, req.validatedParams.id);
      res.json({ success: true, data: download, error: null });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
