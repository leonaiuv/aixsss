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

@Injectable()
export class JobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
    @Inject(AI_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
  ) {}

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
    if (targetEpisodeCount !== undefined && (targetEpisodeCount < 1 || targetEpisodeCount > 24)) {
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

  async cancel(teamId: string, jobId: string) {
    const job = await this.prisma.aIJob.findFirst({ where: { id: jobId, teamId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      throw new BadRequestException('Job already finished');
    }

    // best-effort: remove from queue
    try {
      await this.queue.remove(jobId);
    } catch {
      // ignore
    }

    const updated = await this.prisma.aIJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
      },
    });

    return mapJob(updated);
  }
}
