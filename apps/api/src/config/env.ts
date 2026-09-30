import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  AI_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_TOKEN: z.string().min(8),
  SUPABASE_JWT_SECRET: z.string().min(1),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_API_LIMIT: z.coerce.number().default(300),
  RATE_LIMIT_INTERNAL_LIMIT: z.coerce.number().default(1200),
});

export const env = schema.parse(process.env); // fail fast on boot
export type Env = z.infer<typeof schema>;
