import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateEpisodeInputSchema, UpdateEpisodeInputSchema } from '@aixsss/shared';
import { EpisodesService } from './episodes.service.js';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/episodes')
export class EpisodesController {
  constructor(@Inject(EpisodesService) private readonly episodes: EpisodesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.episodes.list(user.teamId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateEpisodeInputSchema, body);
    return this.episodes.create(user.teamId, projectId, input);
  }

  @Get(':episodeId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.episodes.get(user.teamId, projectId, episodeId);
  }

  @Patch(':episodeId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdateEpisodeInputSchema, body);
    return this.episodes.update(user.teamId, projectId, episodeId, input);
  }

  @Delete(':episodeId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.episodes.remove(user.teamId, projectId, episodeId);
  }
}

