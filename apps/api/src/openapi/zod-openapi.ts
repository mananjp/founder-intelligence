import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

/**
 * Zod 4 installs classic schema methods on each schema instance when it is
 * constructed, so the extension has to be applied before any schema from
 * `@fi/contracts` is built. This module must therefore be imported first from
 * every entrypoint that can reach the OpenAPI spec.
 */
extendZodWithOpenApi(z);
