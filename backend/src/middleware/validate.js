// Maps a validation `source` to where the raw input is read from and where
// the parsed result is written. req.params/req.query must never be
// reassigned - Express 5 re-populates req.params per-layer and req.query is
// a non-assignable prototype getter, so both are read-only inputs here.
const TARGETS = {
  body: { read: (req) => req.body, resultKey: 'validated' },
  params: { read: (req) => req.params, resultKey: 'validatedParams' },
  query: { read: (req) => req.query, resultKey: 'validatedQuery' },
};

function validate(schema, source = 'body') {
  const target = TARGETS[source];

  return (req, res, next) => {
    const result = schema.safeParse(target.read(req));
    if (!result.success) {
      const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return res.status(400).json({ success: false, data: null, error: message });
    }

    req[target.resultKey] = result.data;
    next();
  };
}

module.exports = validate;
