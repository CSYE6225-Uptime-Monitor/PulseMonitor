const { z } = require('zod');

// limit is rejected loudly rather than clamped when it exceeds the max -
// matches this codebase's .strict() reject-loudly convention and surfaces
// client bugs instead of silently hiding them.
const historyQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .strict()
  .refine((data) => !data.from || !data.to || Date.parse(data.from) < Date.parse(data.to), {
    message: 'from must be before to.',
    path: ['from'],
  });

module.exports = { historyQuerySchema };
