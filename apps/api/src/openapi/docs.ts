import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./spec.js";

export const docsRouter = Router();

docsRouter.use("/", swaggerUi.serve, swaggerUi.setup(openApiDocument));