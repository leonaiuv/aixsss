import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_KEY_ENCRYPTION_KEY: z.string().min(32),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  AI_QUEUE_NAME: z.string().min(1).default('ai-jobs'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Env = z.infer<typeof EnvSchema>;


