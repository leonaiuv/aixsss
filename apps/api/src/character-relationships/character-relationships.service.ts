import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CharacterRelationship, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type LegacyRelationship = {
  targetCharacterId: string;
  relationshipType: string;
  description: string;
};

type CreateCharacterRelationshipInput = {
  fromCharacterId: string;
  toCharacterId: string;
  type: string;
  label?: string;
  description?: string;
  intensity?: number;
  arc?: unknown;
};

type UpdateCharacterRelationshipInput = Partial<CreateCharacterRelationshipInput>;

type ApiCharacterRelationship = Omit<CharacterRelationship, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function toIso(date: Date): string {
  return date.toISOString();
}

function mapRelationship(item: CharacterRelationship): ApiCharacterRelationship {
  return {
    ...item,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toLegacyRelationships(rows: Array<{ toCharacterId: string; type: string; description: string }>): LegacyRelationship[] {
  return rows.map((row) => ({
    targetCharacterId: row.toCharacterId,
    relationshipType: row.type,
    description: row.description,
  }));
}

@Injectable()
export class CharacterRelationshipsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertProject(teamId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async assertCharacters(projectId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;
    const found = await this.prisma.character.findMany({
      where: { projectId, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      const got = new Set(found.map((item) => item.id));
      const missing = uniqueIds.filter((id) => !got.has(id));
      throw new BadRequestException(`Characters not found: ${missing.join(', ')}`);
    }
  }

  private async syncLegacyRelationships(projectId: string, characterIds?: string[]) {
    const ids =
      characterIds && characterIds.length > 0
        ? [...new Set(characterIds)]
        : (
            await this.prisma.character.findMany({
              where: { projectId },
              select: { id: true },
            })
          ).map((item) => item.id);

    if (ids.length === 0) return;

    const rows = await this.prisma.characterRelationship.findMany({
      where: { projectId, fromCharacterId: { in: ids } },
      select: { fromCharacterId: true, toCharacterId: true, type: true, description: true },
    });

    const grouped = new Map<string, LegacyRelationship[]>();
    for (const id of ids) grouped.set(id, []);
    for (const row of rows) {
      const current = grouped.get(row.fromCharacterId) ?? [];
      current.push({
        targetCharacterId: row.toCharacterId,
        relationshipType: row.type,
        description: row.description,
      });
      grouped.set(row.fromCharacterId, current);
    }

    for (const id of ids) {
      await this.prisma.character.update({
        where: { id },
        data: {
          relationships: (grouped.get(id) ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async list(teamId: string, projectId: string) {
    await this.assertProject(teamId, projectId);
    const rows = await this.prisma.characterRelationship.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapRelationship);
  }

  async create(teamId: string, projectId: string, input: CreateCharacterRelationshipInput) {
    await this.assertProject(teamId, projectId);
    await this.assertCharacters(projectId, [input.fromCharacterId, input.toCharacterId]);
    if (input.fromCharacterId === input.toCharacterId) {
      throw new BadRequestException('fromCharacterId and toCharacterId cannot be same');
    }

    const row = await this.prisma.characterRelationship.upsert({
      where: {
        projectId_fromCharacterId_toCharacterId: {
          projectId,
          fromCharacterId: input.fromCharacterId,
          toCharacterId: input.toCharacterId,
        },
      },
      update: {
        type: input.type,
        label: input.label ?? input.type,
        description: input.description ?? '',
        intensity: input.intensity ?? 5,
        arc: (input.arc ?? []) as Prisma.InputJsonValue,
      },
      create: {
        projectId,
        fromCharacterId: input.fromCharacterId,
        toCharacterId: input.toCharacterId,
        type: input.type,
        label: input.label ?? input.type,
        description: input.description ?? '',
        intensity: input.intensity ?? 5,
        arc: (input.arc ?? []) as Prisma.InputJsonValue,
      },
    });

    await this.syncLegacyRelationships(projectId, [input.fromCharacterId, input.toCharacterId]);
    return mapRelationship(row);
  }

  async update(teamId: string, projectId: string, relationshipId: string, input: UpdateCharacterRelationshipInput) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.characterRelationship.findFirst({
      where: { id: relationshipId, projectId },
    });
    if (!existing) throw new NotFoundException('Character relationship not found');

    const nextFromCharacterId = input.fromCharacterId ?? existing.fromCharacterId;
    const nextToCharacterId = input.toCharacterId ?? existing.toCharacterId;
    if (nextFromCharacterId === nextToCharacterId) {
      throw new BadRequestException('fromCharacterId and toCharacterId cannot be same');
    }
    await this.assertCharacters(projectId, [nextFromCharacterId, nextToCharacterId]);

    const row = await this.prisma.characterRelationship.update({
      where: { id: relationshipId },
      data: {
        ...(input.fromCharacterId ? { fromCharacterId: input.fromCharacterId } : {}),
        ...(input.toCharacterId ? { toCharacterId: input.toCharacterId } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(typeof input.intensity === 'number' ? { intensity: input.intensity } : {}),
        ...(input.arc !== undefined ? { arc: input.arc as Prisma.InputJsonValue } : {}),
      },
    });

    await this.syncLegacyRelationships(projectId, [
      existing.fromCharacterId,
      existing.toCharacterId,
      nextFromCharacterId,
      nextToCharacterId,
    ]);
    return mapRelationship(row);
  }

  async remove(teamId: string, projectId: string, relationshipId: string) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.characterRelationship.findFirst({
      where: { id: relationshipId, projectId },
      select: { id: true, fromCharacterId: true, toCharacterId: true },
    });
    if (!existing) throw new NotFoundException('Character relationship not found');

    await this.prisma.characterRelationship.delete({ where: { id: relationshipId } });
    await this.syncLegacyRelationships(projectId, [existing.fromCharacterId, existing.toCharacterId]);
    return { ok: true };
  }

  async upsertFromLegacyInput(
    teamId: string,
    projectId: string,
    fromCharacterId: string,
    relationships: unknown,
  ) {
    await this.assertProject(teamId, projectId);
    await this.assertCharacters(projectId, [fromCharacterId]);

    const rows = Array.isArray(relationships)
      ? relationships
          .map((item) => (isRecord(item) ? item : null))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            toCharacterId:
              typeof item.targetCharacterId === 'string' ? item.targetCharacterId : '',
            type:
              typeof item.relationshipType === 'string' ? item.relationshipType : '',
            description:
              typeof item.description === 'string' ? item.description : '',
          }))
          .filter((item) => item.toCharacterId && item.type)
      : [];

    const targetIds = [...new Set(rows.map((item) => item.toCharacterId))];
    await this.assertCharacters(projectId, targetIds);

    for (const row of rows) {
      await this.prisma.characterRelationship.upsert({
        where: {
          projectId_fromCharacterId_toCharacterId: {
            projectId,
            fromCharacterId,
            toCharacterId: row.toCharacterId,
          },
        },
        update: {
          type: row.type,
          label: row.type,
          description: row.description,
        },
        create: {
          projectId,
          fromCharacterId,
          toCharacterId: row.toCharacterId,
          type: row.type,
          label: row.type,
          description: row.description,
        },
      });
    }

    await this.prisma.characterRelationship.deleteMany({
      where: {
        projectId,
        fromCharacterId,
        ...(targetIds.length > 0 ? { toCharacterId: { notIn: targetIds } } : {}),
      },
    });

    // 仅重建当前角色 legacy 字段（输入来自该角色编辑）
    const legacy = toLegacyRelationships(rows);
    await this.prisma.character.update({
      where: { id: fromCharacterId },
      data: { relationships: legacy as unknown as Prisma.InputJsonValue },
    });
  }
}

