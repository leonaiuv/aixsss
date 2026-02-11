import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, toProviderChatConfig, type TokenUsage } from './common.js';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

const GeneratedRelationshipSchema = z.object({
  fromCharacterId: z.string().min(1),
  toCharacterId: z.string().min(1),
  type: z.string().min(1).max(100),
  label: z.string().max(60).optional(),
  description: z.string().max(2000).optional(),
  intensity: z.number().int().min(1).max(10).optional(),
  arc: z
    .array(
      z.object({
        episodeOrder: z.number().int().min(1),
        change: z.string().max(500),
        newIntensity: z.number().int().min(1).max(10),
      }),
    )
    .optional(),
});

type GeneratedRelationship = z.infer<typeof GeneratedRelationshipSchema>;

function parseRelationships(raw: string): { parsed: GeneratedRelationship[]; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'array' });
  return { parsed: z.array(GeneratedRelationshipSchema).parse(json), extractedJson };
}

function buildUserPrompt(args: {
  projectSummary: string;
  narrativeCausalChain: unknown;
  characters: Array<{ id: string; name: string; briefDescription: string | null }>;
}): string {
  return [
    '请根据角色信息和叙事因果链生成角色关系数组 JSON。',
    '要求：每条关系包含 fromCharacterId/toCharacterId/type/label/intensity/arc。',
    'fromCharacterId/toCharacterId 必须优先使用角色ID（若无法确定，可使用角色名，系统会尝试映射）。',
    '',
    `项目梗概：${args.projectSummary || '-'}`,
    '叙事因果链(JSON)：',
    JSON.stringify(args.narrativeCausalChain ?? null),
    '',
    '角色列表：',
    args.characters
      .map((c) => `- ${c.id} | ${c.name} | ${c.briefDescription || '-'}`)
      .join('\n'),
  ].join('\n');
}

function normalizeCharacterRefKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function resolveCharacterId(
  rawRef: string,
  validCharacterIds: Set<string>,
  characterNameToId: Map<string, string>,
): string | null {
  const ref = rawRef.trim();
  if (!ref) return null;
  if (validCharacterIds.has(ref)) return ref;
  const key = normalizeCharacterRefKey(ref);
  if (!key) return null;
  return characterNameToId.get(key) ?? null;
}

function buildLegacyRelationships(fromId: string, rels: GeneratedRelationship[]) {
  return rels
    .filter((rel) => rel.fromCharacterId === fromId)
    .map((rel) => ({
      targetCharacterId: rel.toCharacterId,
      relationshipType: rel.type,
      description: rel.description ?? '',
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function generateCharacterRelationships(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, briefDescription: true, relationships: true },
  });
  if (characters.length < 2) throw new Error('Not enough characters to build relationships');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 5, message: '准备角色关系提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.character_relationships.system',
  });
  const userPrompt = buildUserPrompt({
    projectSummary: project.summary,
    narrativeCausalChain: isRecord(project.contextCache)
      ? project.contextCache.narrativeCausalChain
      : null,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      briefDescription: c.briefDescription,
    })),
  });

  await updateProgress({ pct: 30, message: '调用 AI 生成角色关系...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);
  const tokenUsage: TokenUsage | undefined = mergeTokenUsage(undefined, res.tokenUsage);

  const { parsed, extractedJson } = parseRelationships(res.content);
  const validCharacterIds = new Set(characters.map((c) => c.id));
  const characterNameToId = new Map<string, string>();
  for (const character of characters) {
    const key = normalizeCharacterRefKey(character.name);
    if (!key || characterNameToId.has(key)) continue;
    characterNameToId.set(key, character.id);
  }

  const dedup = new Set<string>();
  const normalized: GeneratedRelationship[] = [];
  for (const rel of parsed) {
    const fromCharacterId = resolveCharacterId(
      rel.fromCharacterId,
      validCharacterIds,
      characterNameToId,
    );
    const toCharacterId = resolveCharacterId(
      rel.toCharacterId,
      validCharacterIds,
      characterNameToId,
    );
    if (!fromCharacterId || !toCharacterId || fromCharacterId === toCharacterId) continue;
    const key = `${fromCharacterId}->${toCharacterId}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    normalized.push({
      ...rel,
      fromCharacterId,
      toCharacterId,
    });
  }

  if (normalized.length === 0) {
    throw new Error(
      'No valid character relationships generated. Check character IDs/names mapping in model output.',
    );
  }

  await updateProgress({ pct: 80, message: '写入关系图谱并同步 legacy 字段...' });

  await prisma.$transaction(async (tx) => {
    for (const rel of normalized) {
      await tx.characterRelationship.upsert({
        where: {
          projectId_fromCharacterId_toCharacterId: {
            projectId,
            fromCharacterId: rel.fromCharacterId,
            toCharacterId: rel.toCharacterId,
          },
        },
        update: {
          type: rel.type,
          label: rel.label ?? rel.type,
          description: rel.description ?? '',
          intensity: rel.intensity ?? 5,
          arc: (rel.arc ?? []) as unknown as Prisma.InputJsonValue,
        },
        create: {
          projectId,
          fromCharacterId: rel.fromCharacterId,
          toCharacterId: rel.toCharacterId,
          type: rel.type,
          label: rel.label ?? rel.type,
          description: rel.description ?? '',
          intensity: rel.intensity ?? 5,
          arc: (rel.arc ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const character of characters) {
      const legacy = buildLegacyRelationships(character.id, normalized);
      await tx.character.update({
        where: { id: character.id },
        data: { relationships: legacy as unknown as Prisma.InputJsonValue },
      });
    }
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    projectId,
    relationshipCount: normalized.length,
    extractedJson,
    tokenUsage: tokenUsage ?? null,
  };
}
