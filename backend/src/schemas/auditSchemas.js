const { z } = require('zod');

const activityQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

module.exports = { activityQuerySchema };
