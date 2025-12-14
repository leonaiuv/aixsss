import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseOrBadRequest } from '../common/zod.js';
import { JobsService } from './jobs.service.js';

const WorkflowBodySchema = z.object({
  aiProfileId: z.string().min(1),
});

@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post('projects/:projectId/scene-list')
  generateSceneList(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateSceneList(user.teamId, projectId, input.aiProfileId);
  }

  @Post('projects/:projectId/scenes/:sceneId/scene-anchor')
  generateSceneAnchor(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateSceneAnchor(user.teamId, projectId, sceneId, input.aiProfileId);
  }

  @Post('projects/:projectId/scenes/:sceneId/keyframe-prompt')
  generateKeyframePrompt(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateKeyframePrompt(user.teamId, projectId, sceneId, input.aiProfileId);
  }

  @Post('projects/:projectId/scenes/:sceneId/motion-prompt')
  generateMotionPrompt(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateMotionPrompt(user.teamId, projectId, sceneId, input.aiProfileId);
  }

  @Post('projects/:projectId/scenes/:sceneId/dialogue')
  generateDialogue(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateDialogue(user.teamId, projectId, sceneId, input.aiProfileId);
  }

  @Post('projects/:projectId/scenes/:sceneId/refine-all')
  refineAll(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('sceneId') sceneId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueRefineSceneAll(user.teamId, projectId, sceneId, input.aiProfileId);
  }
}


