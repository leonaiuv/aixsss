import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Character, Prisma } from '@prisma/client';
import type { CreateCharacterInput, UpdateCharacterInput } from '@aixsss/shared';

function toIso(date: Date): string {
  return date.toISOString();
}

type ApiCharacter = Omit<Character, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

function mapCharacter(character: Character): ApiCharacter {
  return {
    ...character,
    createdAt: toIso(character.createdAt),
    updatedAt: toIso(character.updatedAt),
  };
}

@Injectable()
export class CharactersService {
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
    const characters = await this.prisma.character.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
    });
    return characters.map(mapCharacter);
  }

  async create(teamId: string, projectId: string, input: CreateCharacterInput) {
    await this.assertProject(teamId, projectId);

    const character = await this.prisma.character.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        projectId,
        name: input.name,
        briefDescription: input.briefDescription ?? undefined,
        avatar: input.avatar ?? undefined,
        appearance: input.appearance ?? '',
        personality: input.personality ?? '',
        background: input.background ?? '',
        portraitPrompts: input.portraitPrompts as Prisma.InputJsonValue | undefined,
        customStyle: input.customStyle ?? undefined,
        relationships: input.relationships as Prisma.InputJsonValue | undefined,
        appearances: input.appearances as Prisma.InputJsonValue | undefined,
        themeColor: input.themeColor ?? undefined,
        primaryColor: input.primaryColor ?? undefined,
        secondaryColor: input.secondaryColor ?? undefined,
      },
    });

    return mapCharacter(character);
  }

  async update(teamId: string, projectId: string, characterId: string, input: UpdateCharacterInput) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.character.findFirst({
      where: { id: characterId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Character not found');

    const character = await this.prisma.character.update({
      where: { id: characterId },
      data: {
        ...(typeof input.name === 'string' ? { name: input.name } : {}),
        ...(typeof input.briefDescription === 'string' ? { briefDescription: input.briefDescription } : {}),
        ...(typeof input.avatar === 'string' ? { avatar: input.avatar } : {}),
        ...(typeof input.appearance === 'string' ? { appearance: input.appearance } : {}),
        ...(typeof input.personality === 'string' ? { personality: input.personality } : {}),
        ...(typeof input.background === 'string' ? { background: input.background } : {}),
        ...(input.portraitPrompts !== undefined
          ? { portraitPrompts: input.portraitPrompts as Prisma.InputJsonValue }
          : {}),
        ...(typeof input.customStyle === 'string' ? { customStyle: input.customStyle } : {}),
        ...(input.relationships !== undefined
          ? { relationships: input.relationships as Prisma.InputJsonValue }
          : {}),
        ...(input.appearances !== undefined ? { appearances: input.appearances as Prisma.InputJsonValue } : {}),
        ...(typeof input.themeColor === 'string' ? { themeColor: input.themeColor } : {}),
        ...(typeof input.primaryColor === 'string' ? { primaryColor: input.primaryColor } : {}),
        ...(typeof input.secondaryColor === 'string' ? { secondaryColor: input.secondaryColor } : {}),
      },
    });

    return mapCharacter(character);
  }

  async remove(teamId: string, projectId: string, characterId: string) {
    await this.assertProject(teamId, projectId);
    const existing = await this.prisma.character.findFirst({
      where: { id: characterId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Character not found');

    await this.prisma.character.delete({ where: { id: characterId } });
    return { ok: true };
  }
}


