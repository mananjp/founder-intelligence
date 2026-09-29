import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { validate } from "@scalar/openapi-validator";
import { describe, expect, it } from "vitest";
import { docsRouter } from "../src/openapi/docs.js";
import { openApiDocument } from "../src/openapi/spec.js";

const expectedRoutes = [
  ["get", "/health"],
  ["get", "/health/ready"],
  ["get", "/v1/workspaces"],
  ["post", "/v1/workspaces"],
  ["get", "/v1/workspaces/{workspaceId}/ideas"],
  ["get", "/v1/workspaces/{workspaceId}/ideas/{ideaId}"],
  ["post", "/v1/workspaces/{workspaceId}/ideas"],
  ["post", "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs"],
  [
    "get",
    "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs/{runId}/events",
  ],
] as const;
const protectedRoutes = expectedRoutes.filter(([, path]) =>
  path.startsWith("/v1/"),
);

const operations = openApiDocument.paths as Record<
  string,
  Record<string, Record<string, unknown>>
>;

describe("OpenAPI document", () => {
  it("generates and validates the OpenAPI 3.1 document", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(validate(openApiDocument).valid).toBe(true);
  });

  it("documents every registered runtime route", () => {
    const documentedRoutes = Object.entries(operations).flatMap(
      ([path, pathOperations]) =>
        Object.keys(pathOperations).map((method) => `${method} ${path}`),
    );
    expect(documentedRoutes.sort()).toEqual(
      expectedRoutes.map(([method, path]) => `${method} ${path}`).sort(),
    );

    const operationIds: unknown[] = [];
    for (const [method, path] of expectedRoutes) {
      const operation = operations[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation).toMatchObject({
        operationId: expect.any(String),
        summary: expect.any(String),
        description: expect.any(String),
      });
      operationIds.push(operation?.operationId);
    }
    expect(new Set(operationIds).size).toBe(expectedRoutes.length);
  });

  it("defines request body schemas for every body-bearing route", () => {
    const requestBodySchema = (method: string, path: string) => {
      const requestBody = operations[path]?.[method]?.requestBody as
        | { content?: Record<string, { schema?: Record<string, unknown> }> }
        | undefined;
      return requestBody?.content?.["application/json"]?.schema;
    };

    expect(requestBodySchema("post", "/v1/workspaces")).toMatchObject({
      type: "object",
      properties: { name: { type: "string", maxLength: 120 } },
    });
    expect(
      requestBodySchema("post", "/v1/workspaces/{workspaceId}/ideas"),
    ).toMatchObject({ $ref: "#/components/schemas/CreateIdea" });
    expect(
      requestBodySchema(
        "post",
        "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs",
      ),
    ).toMatchObject({ $ref: "#/components/schemas/StartResearchRun" });
  });

  it("includes schemas and media types for successful responses", () => {
    const jsonResponses = [
      ["get", "/health", "200"],
      ["get", "/health/ready", "200"],
      ["get", "/health/ready", "503"],
      ["get", "/v1/workspaces", "200"],
      ["post", "/v1/workspaces", "201"],
      ["get", "/v1/workspaces/{workspaceId}/ideas", "200"],
      ["get", "/v1/workspaces/{workspaceId}/ideas/{ideaId}", "200"],
      ["post", "/v1/workspaces/{workspaceId}/ideas", "201"],
      [
        "post",
        "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs",
        "202",
      ],
    ] as const;

    for (const [method, path, status] of jsonResponses) {
      const response = operations[path]?.[method]?.responses as
        | Record<string, { content?: Record<string, { schema?: unknown }> }>
        | undefined;
      expect(
        response?.[status]?.content?.["application/json"]?.schema,
      ).toBeDefined();
    }

    const eventStream =
      operations[
        "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs/{runId}/events"
      ]?.get;
    const eventContent = (
      eventStream?.responses as Record<
        string,
        {
          content?: Record<
            string,
            {
              schema?: Record<string, unknown>;
              [extension: string]: unknown;
            }
          >;
        }
      >
    )?.["200"]?.content?.["text/event-stream"];
    expect(eventContent?.schema).toMatchObject({ type: "string" });
    expect(eventContent?.schema?.description).toContain(
      "#/components/schemas/RunEvent",
    );
    expect(
      (
        openApiDocument.components as
          | { schemas?: Record<string, unknown> }
          | undefined
      )?.schemas?.RunEvent,
    ).toBeDefined();
    expect(eventContent?.schema?.example).toContain("data: ");
    expect(eventContent?.schema?.example).toContain("\n\n");
  });

  it("marks every path parameter as a required string", () => {
    for (const [method, path] of expectedRoutes) {
      const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (names.length === 0) continue;

      const operation = operations[path]?.[method];
      const params = operation?.parameters as
        | Array<Record<string, unknown>>
        | undefined;
      for (const name of names) {
        expect(params).toContainEqual(
          expect.objectContaining({
            name,
            in: "path",
            required: true,
            schema: { type: "string" },
          }),
        );
      }
    }
  });

  it("requires bearer authentication only for protected v1 operations", () => {
    for (const [method, path] of protectedRoutes) {
      expect(operations[path]?.[method]).toMatchObject({
        security: [{ bearerAuth: [] }],
      });
    }

    expect(operations["/health"]?.get?.security).toBeUndefined();
    expect(operations["/health/ready"]?.get?.security).toBeUndefined();
  });

  it("serves Swagger UI without requiring an API token", async () => {
    const app = express();
    app.use("/v1/docs", docsRouter);
    const server = app.listen(0);
    await once(server, "listening");

    try {
      const address = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}/v1/docs`;
      const response = await fetch(baseUrl);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Swagger UI");

      const initResponse = await fetch(`${baseUrl}/swagger-ui-init.js`);
      const initScript = await initResponse.text();
      expect(initResponse.status).toBe(200);
      expect(initScript).toContain("Founder Intelligence API");
      expect(initScript).toContain("streamResearchRunEvents");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});