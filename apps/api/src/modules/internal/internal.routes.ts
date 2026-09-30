import { Router } from "express";
import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const internalRouter = Router();

// Guard inbound internal endpoints with internal service token
internalRouter.use((req, _res, next) => {
  const token = req.headers["x-internal-token"];
  if (!token || token !== env.INTERNAL_SERVICE_TOKEN) {
    throw new HttpError(
      401,
      "unauthorized_internal",
      "Missing or invalid internal service token",
    );
  }
  next();
});

internalRouter.get("/ping", (_req, res) => {
  res.json({ status: "ok", tier: "internal" });
});
