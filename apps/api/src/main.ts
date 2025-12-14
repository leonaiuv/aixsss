import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const config = app.get(ConfigService<Env, true>);
  const port = config.get<number>('PORT') ?? 3001;
  const corsOrigin = config.get<string>('CORS_ORIGIN') || 'http://localhost:5173';

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');
  console.log(`[api] listening on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});


