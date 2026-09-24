import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
export const requestId: RequestHandler = (req, res, next) => {
  const id = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("x-request-id", id);
  (req as any).id = id;
  next();
};
