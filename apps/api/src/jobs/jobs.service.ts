import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue, QueueEvents } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { AI_QUEUE, AI_QUEUE_EVENTS } from './jobs.constants.js';
import type { AIJob } from '@prisma/client';
import { validateProjectPlannable } from './planningValidation.js';

function toIso(date: Date): string {
  return date.toISOString();
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

type ApiAIJob = Omit<AIJob, 'createdAt' | 'startedAt' | 'finishedAt'> & {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: unknown | null;
};

function mapJob(job: AIJob, progress: unknown | null = null): ApiAIJob {
  return {
    ...job,
    createdAt: toIso(job.createdAt),
    startedAt: toIsoOrNull(job.startedAt),
    finishedAt: toIsoOrNull(job.finishedAt),
    progress,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const EPISODE_CREATION_STALE_LOCK_MS = 15 * 60_000;

@Injectable()
export class JobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
    @Inject(AI_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
  ) {}

  private async tryReleaseStaleEpisodeCreationLock(conflict: {
    id: string;
    startedAt: Date | null;
  }): Promise<boolean> {
    const startedAt = conflict.startedAt;
    if (!startedAt) return false;
    const ageMs = Date.now() - startedAt.getTime();
    if (!Number.isFinite(ageMs) || ageMs < EPISODE_CREATION_STALE_LOCK_MS) return false;

    let queueJobExists = false;
    try {
      const queueJob = await this.queue.getJob(conflict.id);
      queueJobExists = Boolean(queueJob);
    } catch {
      queueJobExists = false;
    }
    if (queueJobExists) return false;

    await this.prisma.aIJob.update({
      where: { id: conflict.id },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        error: 'episode_creation_stale_lock_auto_released',
      },
    });
    return true;
  }

  private async requireProject(teamId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async requireScene(projectId: string, sceneId: string): Promise<void> {
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId },
      select: { id: true },
    });
    if (!scene) throw new NotFoundException('Scene not found');
  }

  private async requireEpisode(projectId: string, episodeId: string): Promise<void> {
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { id: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');
  }

  private async requireAIProfile(teamId: string, aiProfileId: string): Promise<void> {
    const profile = await this.prisma.aIProfile.findFirst({
      where: { id: aiProfileId, teamId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('AI profile not found');
  }

  private async assertProjectPlannable(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { summary: true, style: true, artStyleConfig: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const result = validateProjectPlannable(project);
    if (!result.ok) throw new BadRequestException({ message: 'Global settings not plannable', missingFields: result.missingFields });
  }

  async get(teamId: string, jobId: string) {
    const job = await this.prisma.aIJob.findFirst({ where: { id: jobId, teamId } });
    if (!job) throw new NotFoundException('Job not found');
    let progress: unknown | null = null;
    try {
      const queueJob = await this.queue.getJob(jobId);
      progress = (queueJob?.progress ?? null) as unknown;
    } catch {
      progress = null;
    }
    return mapJob(job, progress);
  }

  async enqueuePlanEpisodes(
    teamId: string,
    projectId: string,
    aiProfileId: string,
    options?: { targetEpisodeCount?: number },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);
    await this.assertProjectPlannable(teamId, projectId);

    const targetEpisodeCount = options?.targetEpisodeCount;
    if (targetEpisodeCount !== undefined && (targetEpisodeCount < 1 || targetEpisodeCount > 100)) {
      throw new BadRequestException('targetEpisodeCount out of range');
    }

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'plan_episodes',
        status: 'queued',
      },
    });

    // best-effort status hint for UI
    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'EPISODE_PLANNING', currentSceneOrder: 0 },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'plan_episodes',
      { teamId, projectId, aiProfileId, jobId: jobRow.id, options: { targetEpisodeCount } },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueBuildNarrativeCausalChain(
    teamId: string,
    projectId: string,
    aiProfileId: string,
    options?: { phase?: number; force?: boolean },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);
    await this.assertProjectPlannable(teamId, projectId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'build_narrative_causal_chain',
        status: 'queued',
      },
    });

    await this.queue.add(
      'build_narrative_causal_chain',
      {
        teamId,
        projectId,
        aiProfileId,
        jobId: jobRow.id,
        phase: options?.phase,
        force: options?.force === true,
      },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateEpisodeCoreExpression(teamId: string, projectId: string, episodeId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireEpisode(projectId, episodeId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        type: 'generate_episode_core_expression',
        status: 'queued',
      },
    });

    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'EPISODE_CREATING', currentSceneOrder: 0 },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_episode_core_expression',
      { teamId, projectId, episodeId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateEpisodeCoreExpressionBatch(
    teamId: string,
    projectId: string,
    aiProfileId: string,
    options?: { episodeIds?: string[]; force?: boolean },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const episodeIds = options?.episodeIds?.filter(Boolean);
    const episodes = await this.prisma.episode.findMany({
      where: {
        projectId,
        ...(episodeIds && episodeIds.length > 0 ? { id: { in: episodeIds } } : {}),
      },
      select: { id: true, order: true },
      orderBy: { order: 'asc' },
    });

    if (episodeIds && episodeIds.length > 0 && episodes.length !== episodeIds.length) {
      const got = new Set(episodes.map((e) => e.id));
      const missing = episodeIds.filter((id) => !got.has(id));
      throw new BadRequestException({ message: `Episodes not found: ${missing.join(', ')}` });
    }

    if (episodes.length === 0) {
      throw new BadRequestException('No episodes found');
    }

    const orderedEpisodeIds = episodes.map((e) => e.id);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'generate_episode_core_expression_batch',
        status: 'queued',
      },
    });

    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'EPISODE_CREATING', currentSceneOrder: 0 },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_episode_core_expression_batch',
      {
        teamId,
        projectId,
        aiProfileId,
        jobId: jobRow.id,
        episodeIds: orderedEpisodeIds,
        force: options?.force === true,
      },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateEpisodeSceneList(
    teamId: string,
    projectId: string,
    episodeId: string,
    aiProfileId: string,
    options?: { sceneCountHint?: number },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireEpisode(projectId, episodeId);
    await this.requireAIProfile(teamId, aiProfileId);

    const ep = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { coreExpression: true },
    });
    if (!ep) throw new NotFoundException('Episode not found');
    if (!ep.coreExpression) throw new BadRequestException({ message: 'Episode coreExpression missing' });

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        type: 'generate_episode_scene_list',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_episode_scene_list',
      { teamId, projectId, episodeId, aiProfileId, jobId: jobRow.id, options: options ?? {} },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateSceneScript(teamId: string, projectId: string, episodeId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireEpisode(projectId, episodeId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        type: 'generate_scene_script',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_scene_script',
      { teamId, projectId, episodeId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateEmotionArc(teamId: string, projectId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'generate_emotion_arc',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_emotion_arc',
      { teamId, projectId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateSoundDesign(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_sound_design',
        status: 'queued',
      },
    });

    try {
      await this.prisma.scene.update({ where: { id: sceneId }, data: { status: 'sound_design_generating' } });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_sound_design',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateCharacterRelationships(teamId: string, projectId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'generate_character_relationships',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_character_relationships',
      { teamId, projectId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueExpandStoryCharacters(
    teamId: string,
    projectId: string,
    aiProfileId: string,
    options?: { maxNewCharacters?: number },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const maxNewCharacters = options?.maxNewCharacters;
    if (maxNewCharacters !== undefined && (maxNewCharacters < 1 || maxNewCharacters > 20)) {
      throw new BadRequestException('maxNewCharacters out of range');
    }

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'expand_story_characters',
        status: 'queued',
      },
    });

    await this.queue.add(
      'expand_story_characters',
      { teamId, projectId, aiProfileId, jobId: jobRow.id, maxNewCharacters },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueRunWorkflowSupervisor(teamId: string, projectId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const existing = await this.prisma.aIJob.findFirst({
      where: {
        teamId,
        projectId,
        status: { in: ['queued', 'running'] },
        type: {
          in: [
            'run_workflow_supervisor',
            'expand_story_characters',
            'build_narrative_causal_chain',
            'generate_character_relationships',
            'generate_emotion_arc',
          ],
        },
      },
      select: { id: true, status: true, type: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Workflow supervisor is already running for this project (${existing.type}:${existing.id})`,
      );
    }

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'run_workflow_supervisor',
        status: 'queued',
      },
    });

    await this.queue.add(
      'run_workflow_supervisor',
      { teamId, projectId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueRunEpisodeCreationAgent(
    teamId: string,
    projectId: string,
    episodeId: string,
    aiProfileId: string,
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireEpisode(projectId, episodeId);
    await this.requireAIProfile(teamId, aiProfileId);

    const findConflict = () =>
      this.prisma.aIJob.findFirst({
        where: {
          teamId,
          projectId,
          episodeId,
          status: { in: ['queued', 'running'] },
          type: {
            in: [
              'run_episode_creation_agent',
              'generate_episode_core_expression',
              'generate_scene_script',
              'generate_episode_scene_list',
              'refine_scene_all',
              'refine_scene_all_batch',
              'run_episode_creation_scene_task',
              'generate_sound_design',
              'estimate_duration',
            ],
          },
        },
        select: { id: true, type: true, status: true, startedAt: true },
      });

    let conflict = await findConflict();
    if (conflict?.type === 'run_episode_creation_agent' && conflict.status === 'running') {
      const released = await this.tryReleaseStaleEpisodeCreationLock({
        id: conflict.id,
        startedAt: conflict.startedAt,
      });
      if (released) {
        conflict = await findConflict();
      }
    }
    if (conflict) {
      throw new BadRequestException(
        `Episode creation is already running with another job (${conflict.type}:${conflict.id})`,
      );
    }

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        type: 'run_episode_creation_agent',
        status: 'queued',
      },
    });

    await this.queue.add(
      'run_episode_creation_agent',
      { teamId, projectId, episodeId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueEstimateDuration(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'estimate_duration',
        status: 'queued',
      },
    });

    await this.queue.add(
      'estimate_duration',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateSceneList(teamId: string, projectId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'generate_scene_list',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_scene_list',
      { teamId, projectId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateSceneAnchor(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_scene_anchor',
        status: 'queued',
      },
    });

    // best-effort status hint for UI
    try {
      await this.prisma.scene.update({ where: { id: sceneId }, data: { status: 'scene_generating' } });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'scene_description' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_scene_anchor',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateKeyframePrompt(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_keyframe_prompt',
        status: 'queued',
      },
    });

    try {
      await this.prisma.scene.update({ where: { id: sceneId }, data: { status: 'keyframe_generating' } });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'keyframe_prompt' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_keyframe_prompt',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateStoryboardSceneBible(
    teamId: string,
    projectId: string,
    sceneId: string,
    aiProfileId: string,
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_storyboard_scene_bible',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_storyboard_scene_bible',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateStoryboardPlan(
    teamId: string,
    projectId: string,
    sceneId: string,
    aiProfileId: string,
    options?: { cameraMode?: 'A' | 'B' },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_storyboard_plan',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_storyboard_plan',
      {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        jobId: jobRow.id,
        ...(options?.cameraMode ? { cameraMode: options.cameraMode } : {}),
      },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateStoryboardGroup(
    teamId: string,
    projectId: string,
    sceneId: string,
    aiProfileId: string,
    groupId: string,
    options?: { cameraMode?: 'A' | 'B' },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_storyboard_group',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_storyboard_group',
      {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        jobId: jobRow.id,
        groupId,
        ...(options?.cameraMode ? { cameraMode: options.cameraMode } : {}),
      },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueTranslateStoryboardPanels(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'translate_storyboard_panels',
        status: 'queued',
      },
    });

    await this.queue.add(
      'translate_storyboard_panels',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueBackTranslateStoryboardPanels(
    teamId: string,
    projectId: string,
    sceneId: string,
    aiProfileId: string,
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'back_translate_storyboard_panels',
        status: 'queued',
      },
    });

    await this.queue.add(
      'back_translate_storyboard_panels',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateKeyframeImages(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_keyframe_images',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_keyframe_images',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateSceneVideo(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_scene_video',
        status: 'queued',
      },
    });

    await this.queue.add(
      'generate_scene_video',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 1,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateMotionPrompt(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_motion_prompt',
        status: 'queued',
      },
    });

    try {
      await this.prisma.scene.update({ where: { id: sceneId }, data: { status: 'motion_generating' } });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'motion_prompt' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_motion_prompt',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueGenerateDialogue(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'generate_dialogue',
        status: 'queued',
      },
    });

    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'dialogue' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'generate_dialogue',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueRefineSceneAll(teamId: string, projectId: string, sceneId: string, aiProfileId: string) {
    await this.requireProject(teamId, projectId);
    await this.requireScene(projectId, sceneId);
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        sceneId,
        aiProfileId,
        type: 'refine_scene_all',
        status: 'queued',
      },
    });

    try {
      await this.prisma.scene.update({ where: { id: sceneId }, data: { status: 'scene_generating' } });
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'scene_description' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'refine_scene_all',
      { teamId, projectId, sceneId, aiProfileId, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async enqueueRefineAllScenes(
    teamId: string,
    projectId: string,
    aiProfileId: string,
    options?: { sceneIds?: string[] },
  ) {
    await this.requireProject(teamId, projectId);
    await this.requireAIProfile(teamId, aiProfileId);

    const sceneIds = options?.sceneIds?.filter(Boolean);
    const scenes = await this.prisma.scene.findMany({
      where: {
        projectId,
        ...(sceneIds && sceneIds.length > 0 ? { id: { in: sceneIds } } : {}),
      },
      select: {
        id: true,
        order: true,
        episode: { select: { order: true } },
      },
      orderBy: [{ episode: { order: 'asc' } }, { order: 'asc' }],
    });

    if (scenes.length === 0) {
      throw new BadRequestException('No scenes found');
    }

    const orderedSceneIds = scenes.map((scene) => scene.id);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        projectId,
        aiProfileId,
        type: 'refine_scene_all_batch',
        status: 'queued',
      },
    });

    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, currentSceneStep: 'scene_description' },
      });
    } catch {
      // ignore
    }

    await this.queue.add(
      'refine_scene_all_batch',
      { teamId, projectId, aiProfileId, jobId: jobRow.id, sceneIds: orderedSceneIds },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return mapJob(jobRow);
  }

  async runLlmChat(
    teamId: string,
    aiProfileId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ) {
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        aiProfileId,
        type: 'llm_chat',
        status: 'queued',
      },
    });

    const job = await this.queue.add(
      'llm_chat',
      { teamId, aiProfileId, messages, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    // 等待 worker 完成，作为同步 API 返回（用于前端替代直连供应商）
    const raw = await job.waitUntilFinished(this.queueEvents, 120_000);

    const result = isRecord(raw) ? raw : {};
    const tokenUsageRaw = result['tokenUsage'];
    const tokenUsage =
      isRecord(tokenUsageRaw) &&
      typeof tokenUsageRaw.prompt === 'number' &&
      typeof tokenUsageRaw.completion === 'number' &&
      typeof tokenUsageRaw.total === 'number'
        ? { prompt: tokenUsageRaw.prompt, completion: tokenUsageRaw.completion, total: tokenUsageRaw.total }
        : null;

    return {
      jobId: jobRow.id,
      content: typeof result.content === 'string' ? result.content : '',
      tokenUsage,
    };
  }

  /**
   * 入队执行（异步）：立即返回 jobId，由前端轮询 /ai-jobs/:jobId 获取结果
   * - 避免 API 进程同步等待导致 120s 超时报 500
   * - 适用于本地开发环境或网络抖动场景
   */
  async enqueueLlmChat(
    teamId: string,
    aiProfileId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<{ jobId: string }> {
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        aiProfileId,
        type: 'llm_chat',
        status: 'queued',
      },
    });

    await this.queue.add(
      'llm_chat',
      { teamId, aiProfileId, messages, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return { jobId: jobRow.id };
  }

  async enqueueLlmStructuredTest(
    teamId: string,
    aiProfileId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    responseFormat:
      | { type: 'json_object' }
      | {
          type: 'json_schema';
          json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
        },
    overrideParams?: {
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
      reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    },
  ): Promise<{ jobId: string }> {
    await this.requireAIProfile(teamId, aiProfileId);

    const jobRow = await this.prisma.aIJob.create({
      data: {
        teamId,
        aiProfileId,
        type: 'llm_structured_test',
        status: 'queued',
      },
    });

    await this.queue.add(
      'llm_structured_test',
      { teamId, aiProfileId, messages, responseFormat, overrideParams, jobId: jobRow.id },
      {
        jobId: jobRow.id,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    return { jobId: jobRow.id };
  }

  async cancel(teamId: string, jobId: string) {
    const job = await this.prisma.aIJob.findFirst({ where: { id: jobId, teamId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      throw new BadRequestException('Job already finished');
    }

    const cascadingIds = new Set<string>([jobId]);
    if (
      (job.type === 'run_episode_creation_agent' || job.type === 'run_episode_creation_scene_task') &&
      job.projectId &&
      job.episodeId
    ) {
      const siblings = await this.prisma.aIJob.findMany({
        where: {
          teamId,
          projectId: job.projectId,
          episodeId: job.episodeId,
          type: { in: ['run_episode_creation_agent', 'run_episode_creation_scene_task'] },
          status: { in: ['queued', 'running'] },
          id: { not: jobId },
        },
        select: { id: true },
      });
      for (const sibling of siblings) cascadingIds.add(sibling.id);
    }

    const targetIds = Array.from(cascadingIds);
    await Promise.all(
      targetIds.map(async (id) => {
        try {
          await this.queue.remove(id);
        } catch {
          // ignore
        }
      }),
    );

    const finishedAt = new Date();
    await this.prisma.aIJob.updateMany({
      where: { id: { in: targetIds } },
      data: {
        status: 'cancelled',
        finishedAt,
      },
    });
    const updated = await this.prisma.aIJob.findFirst({ where: { id: jobId, teamId } });
    if (!updated) throw new NotFoundException('Job not found');

    return mapJob(updated);
  }
}
