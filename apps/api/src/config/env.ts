import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  API_KEY_ENCRYPTION_KEY: z.string().min(32),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  AI_QUEUE_NAME: z.string().min(1).default('ai-jobs'),
  CORS_ORIGIN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;


