import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { CreateWorldViewElementInputSchema, UpdateWorldViewElementInputSchema } from '@aixsss/shared';
import { WorldViewService } from './world-view.service.js';

const ReorderWorldViewBodySchema = z.object({
  elementIds: z.array(z.string().min(1)).min(1),
});

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/world-view')
export class WorldViewController {
  constructor(@Inject(WorldViewService) private readonly worldView: WorldViewService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.worldView.list(user.teamId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateWorldViewElementInputSchema, body);
    return this.worldView.create(user.teamId, projectId, input);
  }

  @Post('reorder')
  reorder(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ReorderWorldViewBodySchema, body);
    return this.worldView.reorder(user.teamId, projectId, input.elementIds);
  }

  @Patch(':elementId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('elementId') elementId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdateWorldViewElementInputSchema, body);
    return this.worldView.update(user.teamId, projectId, elementId, input);
  }

  @Delete(':elementId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('elementId') elementId: string,
  ) {
    return this.worldView.remove(user.teamId, projectId, elementId);
  }
}


