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

const EpisodePlanBodySchema = WorkflowBodySchema.extend({
  targetEpisodeCount: z.number().int().min(1).max(24).optional(),
});

const EpisodeSceneListBodySchema = WorkflowBodySchema.extend({
  sceneCountHint: z.number().int().min(6).max(24).optional(),
});

const NarrativeCausalChainBodySchema = WorkflowBodySchema.extend({
  phase: z.number().int().min(1).max(4).optional(),
  force: z.boolean().optional(),
});

const RefineAllScenesBodySchema = WorkflowBodySchema.extend({
  sceneIds: z.array(z.string().min(1)).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post('projects/:projectId/episode-plan')
  planEpisodes(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string, @Body() body: unknown) {
    const input = parseOrBadRequest(EpisodePlanBodySchema, body);
    return this.jobs.enqueuePlanEpisodes(user.teamId, projectId, input.aiProfileId, {
      targetEpisodeCount: input.targetEpisodeCount,
    });
  }

  @Post('projects/:projectId/narrative-causal-chain')
  buildNarrativeCausalChain(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(NarrativeCausalChainBodySchema, body);
    return this.jobs.enqueueBuildNarrativeCausalChain(user.teamId, projectId, input.aiProfileId, {
      phase: input.phase,
      force: input.force,
    });
  }

  @Post('projects/:projectId/episodes/:episodeId/core-expression')
  generateEpisodeCoreExpression(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(WorkflowBodySchema, body);
    return this.jobs.enqueueGenerateEpisodeCoreExpression(user.teamId, projectId, episodeId, input.aiProfileId);
  }

  @Post('projects/:projectId/episodes/:episodeId/scene-list')
  generateEpisodeSceneList(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('episodeId') episodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(EpisodeSceneListBodySchema, body);
    return this.jobs.enqueueGenerateEpisodeSceneList(user.teamId, projectId, episodeId, input.aiProfileId, {
      sceneCountHint: input.sceneCountHint,
    });
  }

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

  @Post('projects/:projectId/scenes/refine-all')
  refineAllScenes(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(RefineAllScenesBodySchema, body);
    return this.jobs.enqueueRefineAllScenes(user.teamId, projectId, input.aiProfileId, {
      sceneIds: input.sceneIds,
    });
  }
}
