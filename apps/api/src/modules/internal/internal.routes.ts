import { Router } from "express";

export const internalRouter = Router();

internalRouter.get("/ping", (_req, res) => {
  res.json({ status: "ok", tier: "internal" });
});