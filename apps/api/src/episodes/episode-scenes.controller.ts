import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateSceneInputSchema, UpdateSceneInputSchema } from '@aixsss/shared';
import { ScenesService } from '../scenes/scenes.service.js';

const ReorderScenesBodySchema = z.object({
  sceneIds: z.array(z.string().min(1)).min(1),
});

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/episodes/:episodeId/scenes')
export class EpisodeScenesController {
  constructor(@Inject(ScenesService) private readonly scenes: ScenesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
  ) {
    return this.scenes.listByEpisode(user.teamId, projectId, episodeId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(CreateSceneInputSchema, body);
    return this.scenes.createInEpisode(user.teamId, projectId, episodeId, input);
  }

  @Get(':sceneId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Param('sceneId') sceneId: string,
  ) {
    return this.scenes.getInEpisode(user.teamId, projectId, episodeId, sceneId);
  }

  @Patch(':sceneId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdateSceneInputSchema, body);
    return this.scenes.updateInEpisode(user.teamId, projectId, episodeId, sceneId, input);
  }

  @Delete(':sceneId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Param('sceneId') sceneId: string,
  ) {
    return this.scenes.removeInEpisode(user.teamId, projectId, episodeId, sceneId);
  }

  @Post('reorder')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(ReorderScenesBodySchema, body);
    return this.scenes.reorderInEpisode(user.teamId, projectId, episodeId, input.sceneIds);
  }
}

