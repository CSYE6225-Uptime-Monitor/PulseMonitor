function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return res.status(400).json({ success: false, data: null, error: message });
    }

    req.validated = result.data;
    next();
  };
}

module.exports = validate;
