const { z } = require('zod');

// Matches exportKeys.js's EXPORT_ID_RE exactly - rejecting here at the HTTP
// boundary means keyFromId's own validation is a defense-in-depth backstop,
// never the first line of defense.
const exportIdParamSchema = z.object({ id: z.string().regex(/^\d{13}-[0-9a-f]{8}$/) }).strict();

module.exports = { exportIdParamSchema };
