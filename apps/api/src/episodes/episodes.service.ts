import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEpisodeInput, UpdateEpisodeInput } from '@aixsss/shared';
import type { Episode, Prisma } from '@prisma/client';

function toIso(date: Date): string {
  return date.toISOString();
}

type ApiEpisode = Omit<Episode, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function mapEpisode(episode: Episode): ApiEpisode {
  return {
    ...episode,
    createdAt: toIso(episode.createdAt),
    updatedAt: toIso(episode.updatedAt),
  };
}

function isPrismaKnownRequestError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

@Injectable()
export class EpisodesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertProject(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  async list(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const episodes = await this.prisma.episode.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return episodes.map(mapEpisode);
  }

  async get(teamId: string, projectId: string, episodeId: string) {
    await this.assertProject(teamId, projectId);
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
    });
    if (!episode) throw new NotFoundException('Episode not found');
    return mapEpisode(episode);
  }

  async create(teamId: string, projectId: string, input: CreateEpisodeInput) {
    await this.assertProject(teamId, projectId);
    try {
      const episode = await this.prisma.episode.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          projectId,
          order: input.order,
          title: input.title ?? '',
          summary: input.summary ?? '',
          outline: input.outline as Prisma.InputJsonValue | undefined,
          coreExpression: input.coreExpression as Prisma.InputJsonValue | undefined,
          ...(typeof input.sceneScriptDraft === 'string' ? { sceneScriptDraft: input.sceneScriptDraft } : {}),
          ...(input.emotionArcJson !== undefined
            ? { emotionArcJson: input.emotionArcJson as Prisma.InputJsonValue }
            : {}),
          ...(input.durationEstimateJson !== undefined
            ? { durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue }
            : {}),
          contextCache: input.contextCache as Prisma.InputJsonValue | undefined,
          ...(input.workflowState ? { workflowState: input.workflowState } : {}),
        },
      });
      return mapEpisode(episode);
    } catch (err) {
      if (isPrismaKnownRequestError(err)) {
        throw new BadRequestException('Episode order already exists');
      }
      throw err;
    }
  }

  async update(teamId: string, projectId: string, episodeId: string, input: UpdateEpisodeInput) {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Episode not found');

    const episode = await this.prisma.episode.update({
      where: { id: episodeId },
      data: {
        ...(typeof input.order === 'number' ? { order: input.order } : {}),
        ...(typeof input.title === 'string' ? { title: input.title } : {}),
        ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
        ...(input.outline !== undefined ? { outline: input.outline as Prisma.InputJsonValue } : {}),
        ...(input.coreExpression !== undefined
          ? { coreExpression: input.coreExpression as Prisma.InputJsonValue }
          : {}),
        ...(typeof input.sceneScriptDraft === 'string'
          ? { sceneScriptDraft: input.sceneScriptDraft }
          : {}),
        ...(input.emotionArcJson !== undefined
          ? { emotionArcJson: input.emotionArcJson as Prisma.InputJsonValue }
          : {}),
        ...(input.durationEstimateJson !== undefined
          ? { durationEstimateJson: input.durationEstimateJson as Prisma.InputJsonValue }
          : {}),
        ...(input.contextCache !== undefined
          ? { contextCache: input.contextCache as Prisma.InputJsonValue }
          : {}),
        ...(input.workflowState ? { workflowState: input.workflowState } : {}),
      },
    });
    return mapEpisode(episode);
  }

  async remove(teamId: string, projectId: string, episodeId: string) {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.episode.findFirst({
      where: { id: episodeId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Episode not found');

    const sceneIds = await this.prisma.scene.findMany({
      where: { projectId, episodeId },
      select: { id: true },
    });
    const ids = sceneIds.map((s) => s.id);
    if (ids.length > 0) {
      const activeJob = await this.prisma.aIJob.findFirst({
        where: {
          teamId,
          projectId,
          sceneId: { in: ids },
          status: { in: ['queued', 'running'] },
        },
        select: { id: true, type: true, status: true, sceneId: true },
      });
      if (activeJob) {
        throw new BadRequestException(
          `Episode contains scenes being processed by AI (jobId=${activeJob.id}, sceneId=${activeJob.sceneId}, type=${activeJob.type}, status=${activeJob.status}). Please cancel the job before deleting the episode.`,
        );
      }
    }

    await this.prisma.episode.delete({ where: { id: episodeId } });
    return { ok: true };
  }
}
