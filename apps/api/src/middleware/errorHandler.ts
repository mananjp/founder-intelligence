import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Uniform error envelope: { error: { code, message, details?, requestId } } */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as any).id;
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      });
  }
  // body-parser throws a SyntaxError (with a `body` prop) on malformed JSON
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON",
        requestId,
      },
    });
  }
  logger.error({ err, requestId }, "unhandled error");
  res
    .status(500)
    .json({
      error: { code: "internal", message: "Something went wrong", requestId },
    });
};
