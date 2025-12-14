import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import type { Provider } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { AI_QUEUE, AI_QUEUE_EVENTS } from './jobs.constants.js';

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported REDIS_URL protocol: ${parsed.protocol}`);
  }
  const password = parsed.password || undefined;
  const port = parsed.port ? Number(parsed.port) : 6379;
  return { host: parsed.hostname, port, password };
}

export const jobsProviders: Provider[] = [
  {
    provide: AI_QUEUE,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) => {
      const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
      const queueName = config.get<string>('AI_QUEUE_NAME') ?? 'ai-jobs';
      return new Queue(queueName, { connection: parseRedisUrl(redisUrl) });
    },
  },
  {
    provide: AI_QUEUE_EVENTS,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) => {
      const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
      const queueName = config.get<string>('AI_QUEUE_NAME') ?? 'ai-jobs';
      return new QueueEvents(queueName, { connection: parseRedisUrl(redisUrl) });
    },
  },
];


