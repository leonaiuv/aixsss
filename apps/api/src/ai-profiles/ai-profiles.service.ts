import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateAIProfileInput, UpdateAIProfileInput, ProviderType } from '@aixsss/shared';
import type { AIProfile, Prisma, ProviderType as DbProviderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiKeyCryptoService } from '../crypto/api-key-crypto.service.js';

function toIso(date: Date): string {
  return date.toISOString();
}

function normalizeApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  return trimmed.replace(/^Bearer\s+/i, '').trim().replace(/\s+/g, '');
}

function normalizeArkModel(model: string): string {
  const trimmed = (model || '').trim();
  if (!trimmed) return '';
  const endpointMatch = trimmed.match(/\bep-[0-9a-zA-Z][0-9a-zA-Z-]*\b/);
  if (endpointMatch?.[0]) return endpointMatch[0];
  return trimmed.replace(/\s+/g, '');
}

function normalizeModel(model: string, provider: ProviderType): string {
  const trimmed = (model || '').trim();
  if (!trimmed) return '';
  if (provider === 'doubao-ark') return normalizeArkModel(trimmed);
  return trimmed;
}

function normalizeGenerationParams(provider: ProviderType, raw: unknown): unknown {
  if (provider !== 'doubao-ark') return raw;
  if (!raw || typeof raw !== 'object') return raw;
  const gp = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...gp };

  // Doubao/ARK Responses API 不支持 presence/frequency penalty（且与结构化输出可能冲突）
  delete next.presencePenalty;
  delete next.frequencyPenalty;

  const imageModel = typeof gp.imageModel === 'string' ? normalizeArkModel(gp.imageModel) : '';
  const videoModel = typeof gp.videoModel === 'string' ? normalizeArkModel(gp.videoModel) : '';

  if (typeof gp.imageModel === 'string') {
    if (imageModel) next.imageModel = imageModel;
    else delete next.imageModel;
  }
  if (typeof gp.videoModel === 'string') {
    if (videoModel) next.videoModel = videoModel;
    else delete next.videoModel;
  }

  return next;
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
    const apiKey = normalizeApiKey(input.apiKey);
    if (!apiKey) throw new BadRequestException('API Key 不能为空（请不要包含 Bearer 前缀或多余空格）。');
    const model = normalizeModel(input.model, input.provider);
    if (!model) throw new BadRequestException('模型/接入点不能为空。');
    const profile = await this.prisma.aIProfile.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        teamId,
        name: input.name,
        provider: toDbProvider(input.provider),
        model,
        baseURL: input.baseURL,
        apiKeyEncrypted: this.crypto.encrypt(apiKey),
        generationParams: (normalizeGenerationParams(input.provider, input.generationParams) ??
          undefined) as Prisma.InputJsonValue | undefined,
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
      select: { id: true, provider: true },
    });
    if (!existing) throw new NotFoundException('AI profile not found');

    const effectiveProvider: ProviderType = input.provider ?? fromDbProvider(existing.provider);
    const nextProvider: DbProviderType | undefined = input.provider ? toDbProvider(input.provider) : undefined;

    const profile = await this.prisma.aIProfile.update({
      where: { id: profileId },
      data: {
        ...(typeof input.name === 'string' ? { name: input.name } : {}),
        ...(nextProvider ? { provider: nextProvider } : {}),
        ...(typeof input.model === 'string'
          ? (() => {
              const model = normalizeModel(input.model, effectiveProvider);
              if (!model) throw new BadRequestException('模型/接入点不能为空。');
              return { model };
            })()
          : {}),
        ...(input.baseURL !== undefined ? { baseURL: input.baseURL ?? null } : {}),
        ...(nextProvider === 'kimi' ? { baseURL: null } : {}),
        ...(input.generationParams !== undefined
          ? {
              generationParams: normalizeGenerationParams(
                effectiveProvider,
                input.generationParams,
              ) as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.pricing !== undefined ? { pricing: input.pricing as Prisma.InputJsonValue } : {}),
        ...(typeof input.apiKey === 'string'
          ? (() => {
              const apiKey = normalizeApiKey(input.apiKey);
              if (!apiKey)
                throw new BadRequestException('API Key 不能为空（请不要包含 Bearer 前缀或多余空格）。');
              return { apiKeyEncrypted: this.crypto.encrypt(apiKey) };
            })()
          : {}),
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
