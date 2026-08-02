const { z } = require('zod');
const { assertSiteUrl } = require('../utils/urlGuard');

// Floor of 5 is a hard contract invariant: the pinger's EventBridge rule
// ticks every 5 minutes (infrastructure/modules/monitoring, var.ping_schedule),
// so the API cannot promise a finer check interval than that.
const ALLOWED_FREQUENCIES = [5, 10, 15, 30, 60, 120, 360, 720, 1440];

const urlField = z
  .string()
  .max(2048)
  .superRefine((value, ctx) => {
    const result = assertSiteUrl(value);
    if (result.blocked) {
      ctx.addIssue({ code: 'custom', message: `URL rejected: ${result.reason}` });
    }
  });

const nameField = z.string().trim().min(1).max(100);

const frequencyField = z
  .number()
  .int()
  .refine((value) => ALLOWED_FREQUENCIES.includes(value), {
    message: `check_frequency_minutes must be one of ${ALLOWED_FREQUENCIES.join(', ')}.`,
  });

const enabledField = z.boolean();

const createSiteSchema = z
  .object({
    url: urlField,
    name: nameField,
    check_frequency_minutes: frequencyField.optional().default(5),
    enabled: enabledField.optional().default(true),
  })
  .strict();

const updateSiteSchema = z
  .object({
    url: urlField.optional(),
    name: nameField.optional(),
    check_frequency_minutes: frequencyField.optional(),
    enabled: enabledField.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

const siteIdParamSchema = z.object({ id: z.uuid() }).strict();

module.exports = { createSiteSchema, updateSiteSchema, siteIdParamSchema, ALLOWED_FREQUENCIES };
