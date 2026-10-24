/** Replaces req.body with the parsed (defaulted, trimmed) value or forwards a ZodError. */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};
