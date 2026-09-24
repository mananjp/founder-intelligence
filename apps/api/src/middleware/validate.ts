import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { HttpError } from "./errorHandler.js";

export const validate =
  (schema: { body?: ZodSchema; query?: ZodSchema }): RequestHandler =>
  (req, _res, next) => {
    if (schema.body) {
      const r = schema.body.safeParse(req.body);
      if (!r.success)
        throw new HttpError(
          422,
          "validation_failed",
          "Invalid body",
          r.error.flatten(),
        );
      req.body = r.data;
    }
    if (schema.query) {
      const r = schema.query.safeParse(req.query);
      if (!r.success)
        throw new HttpError(
          422,
          "validation_failed",
          "Invalid query",
          r.error.flatten(),
        );
    }
    next();
  };
