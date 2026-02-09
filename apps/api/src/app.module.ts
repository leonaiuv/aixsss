import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvSchema } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ScenesModule } from './scenes/scenes.module.js';
import { CharactersModule } from './characters/characters.module.js';
import { WorldViewModule } from './world-view/world-view.module.js';
import { AIProfilesModule } from './ai-profiles/ai-profiles.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';
import { EpisodesModule } from './episodes/episodes.module.js';
import { SystemPromptsModule } from './system-prompts/system-prompts.module.js';
import { CharacterRelationshipsModule } from './character-relationships/character-relationships.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => EnvSchema.parse(env),
    }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    EpisodesModule,
    ScenesModule,
    CharactersModule,
    CharacterRelationshipsModule,
    WorldViewModule,
    AIProfilesModule,
    JobsModule,
    SystemPromptsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
