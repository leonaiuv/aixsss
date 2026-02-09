import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSceneInput, UpdateSceneInput } from '@aixsss/shared';
import type { Prisma, Scene, SceneStatus } from '@prisma/client';

function toIso(date: Date): string {
  return date.toISOString();
}

type ApiScene = Omit<Scene, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function mapScene(scene: Scene): ApiScene {
  return {
    ...scene,
    createdAt: toIso(scene.createdAt),
    updatedAt: toIso(scene.updatedAt),
  };
}

@Injectable()
export class ScenesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertProject(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async assertEpisode(teamId: string, projectId: string, episodeId: string) {
    await this.assertProject(teamId, projectId);
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { id: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');
  }

  private async ensureDefaultEpisode(teamId: string, projectId: string): Promise<{ id: string }> {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.episode.findFirst({
      where: { projectId, order: 1 },
      select: { id: true },
    });
    if (existing) return existing;

    try {
      return await this.prisma.episode.create({
        data: { projectId, order: 1, title: '', summary: '', workflowState: 'IDLE' },
        select: { id: true },
      });
    } catch {
      // In case of race, re-fetch.
      const created = await this.prisma.episode.findFirst({
        where: { projectId, order: 1 },
        select: { id: true },
      });
      if (!created) throw new Error('Failed to ensure default episode');
      return created;
    }
  }

  async list(teamId: string, projectId: string) {
    const episode = await this.ensureDefaultEpisode(teamId, projectId);
    const scenes = await this.prisma.scene.findMany({
      where: { projectId, episodeId: episode.id },
      orderBy: { order: 'asc' },
    });
    return scenes.map(mapScene);
  }

  async listByEpisode(teamId: string, projectId: string, episodeId: string) {
    await this.assertEpisode(teamId, projectId, episodeId);
    const scenes = await this.prisma.scene.findMany({
      where: { projectId, episodeId },
      orderBy: { order: 'asc' },
    });
    return scenes.map(mapScene);
  }

  async get(teamId: string, projectId: string, sceneId: string) {
    await this.assertProject(teamId, projectId);
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId },
    });
    if (!scene) throw new NotFoundException('Scene not found');
    return mapScene(scene);
  }

  async getInEpisode(teamId: string, projectId: string, episodeId: string, sceneId: string) {
    await this.assertEpisode(teamId, projectId, episodeId);
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId, episodeId },
    });
    if (!scene) throw new NotFoundException('Scene not found');
    return mapScene(scene);
  }

  async create(teamId: string, projectId: string, input: CreateSceneInput) {
    const episode = await this.ensureDefaultEpisode(teamId, projectId);
    const scene = await this.prisma.scene.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        episodeId: episode.id,
        order: input.order,
        summary: input.summary ?? '',
        sceneDescription: input.sceneDescription ?? '',
        actionDescription: input.actionDescription ?? '',
        castCharacterIds: input.castCharacterIds ?? [],
        shotPrompt: input.shotPrompt ?? '',
        motionPrompt: input.motionPrompt ?? '',
        generatedImages: (input.generatedImages ?? undefined) as Prisma.InputJsonValue,
        generatedVideos: (input.generatedVideos ?? undefined) as Prisma.InputJsonValue,
        storyboardSceneBibleJson: input.storyboardSceneBibleJson as Prisma.InputJsonValue,
        storyboardPlanJson: input.storyboardPlanJson as Prisma.InputJsonValue,
        storyboardGroupsJson: input.storyboardGroupsJson as Prisma.InputJsonValue,
        sceneScriptJson: input.sceneScriptJson as Prisma.InputJsonValue,
        soundDesignJson: input.soundDesignJson as Prisma.InputJsonValue,
        transitionInJson: input.transitionInJson as Prisma.InputJsonValue,
        transitionOutJson: input.transitionOutJson as Prisma.InputJsonValue,
        shotLanguageJson: input.shotLanguageJson as Prisma.InputJsonValue,
        durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue,
        dialogues: input.dialogues ?? undefined,
        contextSummary: input.contextSummary ?? undefined,
        status: (input.status as SceneStatus) ?? undefined,
        notes: input.notes ?? '',
      },
    });
    return mapScene(scene);
  }

  async createInEpisode(teamId: string, projectId: string, episodeId: string, input: CreateSceneInput) {
    await this.assertEpisode(teamId, projectId, episodeId);
    const scene = await this.prisma.scene.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        episodeId,
        order: input.order,
        summary: input.summary ?? '',
        sceneDescription: input.sceneDescription ?? '',
        actionDescription: input.actionDescription ?? '',
        castCharacterIds: input.castCharacterIds ?? [],
        shotPrompt: input.shotPrompt ?? '',
        motionPrompt: input.motionPrompt ?? '',
        generatedImages: (input.generatedImages ?? undefined) as Prisma.InputJsonValue,
        generatedVideos: (input.generatedVideos ?? undefined) as Prisma.InputJsonValue,
        storyboardSceneBibleJson: input.storyboardSceneBibleJson as Prisma.InputJsonValue,
        storyboardPlanJson: input.storyboardPlanJson as Prisma.InputJsonValue,
        storyboardGroupsJson: input.storyboardGroupsJson as Prisma.InputJsonValue,
        sceneScriptJson: input.sceneScriptJson as Prisma.InputJsonValue,
        soundDesignJson: input.soundDesignJson as Prisma.InputJsonValue,
        transitionInJson: input.transitionInJson as Prisma.InputJsonValue,
        transitionOutJson: input.transitionOutJson as Prisma.InputJsonValue,
        shotLanguageJson: input.shotLanguageJson as Prisma.InputJsonValue,
        durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue,
        dialogues: input.dialogues ?? undefined,
        contextSummary: input.contextSummary ?? undefined,
        status: (input.status as SceneStatus) ?? undefined,
        notes: input.notes ?? '',
      },
    });
    return mapScene(scene);
  }

  async update(teamId: string, projectId: string, sceneId: string, input: UpdateSceneInput) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Scene not found');

    const scene = await this.prisma.scene.update({
      where: { id: sceneId },
      data: {
        ...(typeof input.order === 'number' ? { order: input.order } : {}),
        ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
        ...(typeof input.sceneDescription === 'string' ? { sceneDescription: input.sceneDescription } : {}),
        ...(typeof input.actionDescription === 'string' ? { actionDescription: input.actionDescription } : {}),
        ...(input.castCharacterIds !== undefined ? { castCharacterIds: input.castCharacterIds } : {}),
        ...(typeof input.shotPrompt === 'string' ? { shotPrompt: input.shotPrompt } : {}),
        ...(typeof input.motionPrompt === 'string' ? { motionPrompt: input.motionPrompt } : {}),
        ...(input.generatedImages !== undefined
          ? { generatedImages: input.generatedImages as Prisma.InputJsonValue }
          : {}),
        ...(input.generatedVideos !== undefined
          ? { generatedVideos: input.generatedVideos as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardSceneBibleJson !== undefined
          ? { storyboardSceneBibleJson: input.storyboardSceneBibleJson as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardPlanJson !== undefined
          ? { storyboardPlanJson: input.storyboardPlanJson as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardGroupsJson !== undefined
          ? { storyboardGroupsJson: input.storyboardGroupsJson as Prisma.InputJsonValue }
          : {}),
        ...(input.sceneScriptJson !== undefined
          ? { sceneScriptJson: input.sceneScriptJson as Prisma.InputJsonValue }
          : {}),
        ...(input.soundDesignJson !== undefined
          ? { soundDesignJson: input.soundDesignJson as Prisma.InputJsonValue }
          : {}),
        ...(input.transitionInJson !== undefined
          ? { transitionInJson: input.transitionInJson as Prisma.InputJsonValue }
          : {}),
        ...(input.transitionOutJson !== undefined
          ? { transitionOutJson: input.transitionOutJson as Prisma.InputJsonValue }
          : {}),
        ...(input.shotLanguageJson !== undefined
          ? { shotLanguageJson: input.shotLanguageJson as Prisma.InputJsonValue }
          : {}),
        ...(input.durationEstimateJson !== undefined
          ? { durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue }
          : {}),
        ...(input.dialogues !== undefined ? { dialogues: input.dialogues as Prisma.InputJsonValue } : {}),
        ...(input.contextSummary !== undefined
          ? { contextSummary: input.contextSummary as Prisma.InputJsonValue }
          : {}),
        ...(input.status ? { status: input.status as SceneStatus } : {}),
        ...(typeof input.notes === 'string' ? { notes: input.notes } : {}),
      },
    });
    return mapScene(scene);
  }

  async updateInEpisode(
    teamId: string,
    projectId: string,
    episodeId: string,
    sceneId: string,
    input: UpdateSceneInput,
  ) {
    await this.assertEpisode(teamId, projectId, episodeId);
    const existing = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId, episodeId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Scene not found');

    const scene = await this.prisma.scene.update({
      where: { id: sceneId },
      data: {
        ...(typeof input.order === 'number' ? { order: input.order } : {}),
        ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
        ...(typeof input.sceneDescription === 'string' ? { sceneDescription: input.sceneDescription } : {}),
        ...(typeof input.actionDescription === 'string' ? { actionDescription: input.actionDescription } : {}),
        ...(input.castCharacterIds !== undefined ? { castCharacterIds: input.castCharacterIds } : {}),
        ...(typeof input.shotPrompt === 'string' ? { shotPrompt: input.shotPrompt } : {}),
        ...(typeof input.motionPrompt === 'string' ? { motionPrompt: input.motionPrompt } : {}),
        ...(input.generatedImages !== undefined
          ? { generatedImages: input.generatedImages as Prisma.InputJsonValue }
          : {}),
        ...(input.generatedVideos !== undefined
          ? { generatedVideos: input.generatedVideos as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardSceneBibleJson !== undefined
          ? { storyboardSceneBibleJson: input.storyboardSceneBibleJson as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardPlanJson !== undefined
          ? { storyboardPlanJson: input.storyboardPlanJson as Prisma.InputJsonValue }
          : {}),
        ...(input.storyboardGroupsJson !== undefined
          ? { storyboardGroupsJson: input.storyboardGroupsJson as Prisma.InputJsonValue }
          : {}),
        ...(input.sceneScriptJson !== undefined
          ? { sceneScriptJson: input.sceneScriptJson as Prisma.InputJsonValue }
          : {}),
        ...(input.soundDesignJson !== undefined
          ? { soundDesignJson: input.soundDesignJson as Prisma.InputJsonValue }
          : {}),
        ...(input.transitionInJson !== undefined
          ? { transitionInJson: input.transitionInJson as Prisma.InputJsonValue }
          : {}),
        ...(input.transitionOutJson !== undefined
          ? { transitionOutJson: input.transitionOutJson as Prisma.InputJsonValue }
          : {}),
        ...(input.shotLanguageJson !== undefined
          ? { shotLanguageJson: input.shotLanguageJson as Prisma.InputJsonValue }
          : {}),
        ...(input.durationEstimateJson !== undefined
          ? { durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue }
          : {}),
        ...(input.dialogues !== undefined ? { dialogues: input.dialogues as Prisma.InputJsonValue } : {}),
        ...(input.contextSummary !== undefined
          ? { contextSummary: input.contextSummary as Prisma.InputJsonValue }
          : {}),
        ...(input.status ? { status: input.status as SceneStatus } : {}),
        ...(typeof input.notes === 'string' ? { notes: input.notes } : {}),
      },
    });
    return mapScene(scene);
  }

  async remove(teamId: string, projectId: string, sceneId: string) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Scene not found');

    const activeJob = await this.prisma.aIJob.findFirst({
      where: {
        teamId,
        projectId,
        sceneId,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, type: true, status: true },
    });
    if (activeJob) {
      throw new BadRequestException(
        `Scene is being processed by AI (jobId=${activeJob.id}, type=${activeJob.type}, status=${activeJob.status}). Please cancel the job before deleting.`,
      );
    }

    await this.prisma.scene.delete({ where: { id: sceneId } });
    return { ok: true };
  }

  async removeInEpisode(teamId: string, projectId: string, episodeId: string, sceneId: string) {
    await this.assertEpisode(teamId, projectId, episodeId);
    const existing = await this.prisma.scene.findFirst({
      where: { id: sceneId, projectId, episodeId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Scene not found');

    const activeJob = await this.prisma.aIJob.findFirst({
      where: {
        teamId,
        projectId,
        sceneId,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, type: true, status: true },
    });
    if (activeJob) {
      throw new BadRequestException(
        `Scene is being processed by AI (jobId=${activeJob.id}, type=${activeJob.type}, status=${activeJob.status}). Please cancel the job before deleting.`,
      );
    }

    await this.prisma.scene.delete({ where: { id: sceneId } });
    return { ok: true };
  }

  async reorder(teamId: string, projectId: string, sceneIds: string[]) {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.scene.findMany({
      where: { projectId, id: { in: sceneIds } },
      select: { id: true, episodeId: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));

    for (const id of sceneIds) {
      if (!existingIds.has(id)) throw new BadRequestException('Invalid sceneIds');
    }

    const episodeIds = new Set(existing.map((s) => s.episodeId));
    if (episodeIds.size !== 1) {
      throw new BadRequestException('sceneIds must belong to the same episode');
    }

    // Re-assign orders in a single transaction
    await this.prisma.$transaction(
      sceneIds.map((id, idx) =>
        this.prisma.scene.update({
          where: { id },
          data: { order: idx + 1 },
        }),
      ),
    );

    return this.list(teamId, projectId);
  }

  async reorderInEpisode(teamId: string, projectId: string, episodeId: string, sceneIds: string[]) {
    await this.assertEpisode(teamId, projectId, episodeId);

    const existing = await this.prisma.scene.findMany({
      where: { projectId, episodeId, id: { in: sceneIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));

    for (const id of sceneIds) {
      if (!existingIds.has(id)) throw new BadRequestException('Invalid sceneIds');
    }

    await this.prisma.$transaction(
      sceneIds.map((id, idx) =>
        this.prisma.scene.update({
          where: { id },
          data: { order: idx + 1 },
        }),
      ),
    );

    return this.listByEpisode(teamId, projectId, episodeId);
  }
}
