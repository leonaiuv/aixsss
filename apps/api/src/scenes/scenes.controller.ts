import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ScenesService } from './scenes.service.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateSceneInputSchema, UpdateSceneInputSchema } from '@aixsss/shared';

const ReorderScenesBodySchema = z.object({
  sceneIds: z.array(z.string().min(1)).min(1),
});

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/scenes')
export class ScenesController {
  constructor(@Inject(ScenesService) private readonly scenes: ScenesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.scenes.list(user.teamId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateSceneInputSchema, body);
    return this.scenes.create(user.teamId, projectId, input);
  }

  @Get(':sceneId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
  ) {
    return this.scenes.get(user.teamId, projectId, sceneId);
  }

  @Patch(':sceneId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdateSceneInputSchema, body);
    return this.scenes.update(user.teamId, projectId, sceneId, input);
  }

  @Delete(':sceneId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
  ) {
    return this.scenes.remove(user.teamId, projectId, sceneId);
  }

  @Post('reorder')
  reorder(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ReorderScenesBodySchema, body);
    return this.scenes.reorder(user.teamId, projectId, input.sceneIds);
  }
}


