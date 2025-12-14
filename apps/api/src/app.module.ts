import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvSchema } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ScenesModule } from './scenes/scenes.module.js';
import { AIProfilesModule } from './ai-profiles/ai-profiles.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => EnvSchema.parse(env),
    }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    ScenesModule,
    AIProfilesModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}


