/**
 * Request payload validation middleware using Zod schemas.
 */

export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};
