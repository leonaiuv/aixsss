import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAIProfileInput, UpdateAIProfileInput, ProviderType } from '@aixsss/shared';
import type { AIProfile, Prisma, ProviderType as DbProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeyCryptoService } from '../crypto/api-key-crypto.service.js';

function toIso(date: Date): string {
  return date.toISOString();
}

const PROVIDER_TO_DB: Record<ProviderType, DbProviderType> = {
  deepseek: 'deepseek',
  kimi: 'kimi',
  gemini: 'gemini',
  'openai-compatible': 'openai_compatible',
  'doubao-ark': 'doubao_ark',
};

function toDbProvider(provider: ProviderType): DbProviderType {
  return PROVIDER_TO_DB[provider];
}

function fromDbProvider(provider: string): ProviderType {
  if (provider === 'openai_compatible') return 'openai-compatible';
  if (provider === 'doubao_ark') return 'doubao-ark';
  return provider as ProviderType;
}

@Injectable()
export class AIProfilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ApiKeyCryptoService) private readonly crypto: ApiKeyCryptoService,
  ) {}

  async list(teamId: string) {
    const profiles = await this.prisma.aIProfile.findMany({
      where: { teamId },
      orderBy: { updatedAt: 'desc' },
    });

    return profiles.map((p: AIProfile) => ({
      id: p.id,
      teamId: p.teamId,
      name: p.name,
      provider: fromDbProvider(p.provider),
      model: p.model,
      baseURL: p.baseURL ?? null,
      generationParams: p.generationParams ?? null,
      pricing: p.pricing ?? null,
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
    }));
  }

  async create(teamId: string, input: CreateAIProfileInput) {
    const profile = await this.prisma.aIProfile.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        teamId,
        name: input.name,
        provider: toDbProvider(input.provider),
        model: input.model,
        baseURL: input.baseURL,
        apiKeyEncrypted: this.crypto.encrypt(input.apiKey),
        generationParams: input.generationParams ?? undefined,
        pricing: input.pricing ? (input.pricing as Prisma.InputJsonValue) : undefined,
      },
    });

    return {
      id: profile.id,
      name: profile.name,
      provider: fromDbProvider(profile.provider),
      model: profile.model,
      baseURL: profile.baseURL ?? null,
      generationParams: profile.generationParams ?? null,
      pricing: profile.pricing ?? null,
      createdAt: toIso(profile.createdAt),
      updatedAt: toIso(profile.updatedAt),
    };
  }

  async update(teamId: string, profileId: string, input: UpdateAIProfileInput) {
    const existing = await this.prisma.aIProfile.findFirst({
      where: { id: profileId, teamId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('AI profile not found');

    const nextProvider: DbProviderType | undefined = input.provider ? toDbProvider(input.provider) : undefined;

    const profile = await this.prisma.aIProfile.update({
      where: { id: profileId },
      data: {
        ...(typeof input.name === 'string' ? { name: input.name } : {}),
        ...(nextProvider ? { provider: nextProvider } : {}),
        ...(typeof input.model === 'string' ? { model: input.model } : {}),
        ...(input.baseURL !== undefined ? { baseURL: input.baseURL ?? null } : {}),
        ...(nextProvider === 'kimi' ? { baseURL: null } : {}),
        ...(input.generationParams !== undefined
          ? { generationParams: input.generationParams as Prisma.InputJsonValue }
          : {}),
        ...(input.pricing !== undefined ? { pricing: input.pricing as Prisma.InputJsonValue } : {}),
        ...(typeof input.apiKey === 'string' ? { apiKeyEncrypted: this.crypto.encrypt(input.apiKey) } : {}),
      },
    });

    return {
      id: profile.id,
      name: profile.name,
      provider: fromDbProvider(profile.provider),
      model: profile.model,
      baseURL: profile.baseURL ?? null,
      generationParams: profile.generationParams ?? null,
      pricing: profile.pricing ?? null,
      createdAt: toIso(profile.createdAt),
      updatedAt: toIso(profile.updatedAt),
    };
  }

  async remove(teamId: string, profileId: string) {
    const existing = await this.prisma.aIProfile.findFirst({
      where: { id: profileId, teamId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('AI profile not found');

    await this.prisma.aIProfile.delete({ where: { id: profileId } });
    return { ok: true };
  }
}

