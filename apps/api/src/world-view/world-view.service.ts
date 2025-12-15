import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WorldViewElement } from '@prisma/client';
import type { CreateWorldViewElementInput, UpdateWorldViewElementInput } from '@aixsss/shared';

function toIso(date: Date): string {
  return date.toISOString();
}

type ApiWorldViewElement = Omit<WorldViewElement, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function mapElement(el: WorldViewElement): ApiWorldViewElement {
  return {
    ...el,
    createdAt: toIso(el.createdAt),
    updatedAt: toIso(el.updatedAt),
  };
}

@Injectable()
export class WorldViewService {
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
    const elements = await this.prisma.worldViewElement.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
    });
    return elements.map(mapElement);
  }

  async create(teamId: string, projectId: string, input: CreateWorldViewElementInput) {
    await this.assertProject(teamId, projectId);

    const element = await this.prisma.worldViewElement.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        type: input.type,
        title: input.title,
        content: input.content ?? '',
        order: input.order,
      },
    });
    return mapElement(element);
  }

  async update(teamId: string, projectId: string, elementId: string, input: UpdateWorldViewElementInput) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.worldViewElement.findFirst({
      where: { id: elementId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('WorldViewElement not found');

    const element = await this.prisma.worldViewElement.update({
      where: { id: elementId },
      data: {
        ...(typeof input.type === 'string' ? { type: input.type } : {}),
        ...(typeof input.title === 'string' ? { title: input.title } : {}),
        ...(typeof input.content === 'string' ? { content: input.content } : {}),
        ...(typeof input.order === 'number' ? { order: input.order } : {}),
      },
    });
    return mapElement(element);
  }

  async remove(teamId: string, projectId: string, elementId: string) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.worldViewElement.findFirst({
      where: { id: elementId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('WorldViewElement not found');

    await this.prisma.worldViewElement.delete({ where: { id: elementId } });
    return { ok: true };
  }

  async reorder(teamId: string, projectId: string, elementIds: string[]) {
    await this.assertProject(teamId, projectId);

    const existing = await this.prisma.worldViewElement.findMany({
      where: { projectId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    for (const id of elementIds) {
      if (!existingIds.has(id)) throw new BadRequestException('Invalid elementIds');
    }

    // 两阶段更新，避免 (projectId, order) 唯一约束在交换顺序时冲突
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        elementIds.map((id, idx) =>
          tx.worldViewElement.update({
            where: { id },
            data: { order: -(idx + 1) },
          }),
        ),
      );

      await Promise.all(
        elementIds.map((id, idx) =>
          tx.worldViewElement.update({
            where: { id },
            data: { order: idx + 1 },
          }),
        ),
      );
    });

    return this.list(teamId, projectId);
  }
}

