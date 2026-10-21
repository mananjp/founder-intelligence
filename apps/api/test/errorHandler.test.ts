import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requestId } from "../src/middleware/requestId.js";
import { errorHandler } from "../src/middleware/errorHandler.js";

function appWithBodyParser() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.post("/echo", (req, res) => res.json(req.body));
  app.use(errorHandler);
  return app;
}

describe("errorHandler — malformed JSON", () => {
  it("maps a body-parser SyntaxError to 400 INVALID_JSON with requestId", async () => {
    const res = await request(appWithBodyParser())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{ not valid json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON",
        requestId: res.headers["x-request-id"],
      },
    });
    expect(res.body.error.requestId).toBeTruthy();
  });
});
