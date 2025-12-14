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

  async list(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const scenes = await this.prisma.scene.findMany({
      where: { projectId },
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

  async create(teamId: string, projectId: string, input: CreateSceneInput) {
    await this.assertProject(teamId, projectId);
    const scene = await this.prisma.scene.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        order: input.order,
        summary: input.summary ?? '',
        sceneDescription: input.sceneDescription ?? '',
        actionDescription: input.actionDescription ?? '',
        shotPrompt: input.shotPrompt ?? '',
        motionPrompt: input.motionPrompt ?? '',
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
        ...(typeof input.shotPrompt === 'string' ? { shotPrompt: input.shotPrompt } : {}),
        ...(typeof input.motionPrompt === 'string' ? { motionPrompt: input.motionPrompt } : {}),
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

    await this.prisma.scene.delete({ where: { id: sceneId } });
    return { ok: true };
  }

  async reorder(teamId: string, projectId: string, sceneIds: string[]) {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.scene.findMany({
      where: { projectId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));

    for (const id of sceneIds) {
      if (!existingIds.has(id)) throw new BadRequestException('Invalid sceneIds');
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
}


