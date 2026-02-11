import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage, ProviderChatConfig } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, styleFullPrompt, toProviderChatConfig, type TokenUsage } from './common.js';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import {
  getAgentMaxSteps,
  getAgentStepTimeoutMs,
  getAgentTotalTimeoutMs,
  isAgentCharacterExpansionEnabled,
  isAgentFallbackToLegacyEnabled,
} from '../agents/runtime/featureFlags.js';

const MAX_NEW_CHARACTERS_DEFAULT = 8;
const MAX_NEW_CHARACTERS_LIMIT = 20;
const MIN_CONFIDENCE = 0.45;

const ExpansionCandidateSchema = z
  .object({
    name: z.string().min(1).max(80),
    aliases: z.array(z.string().min(1).max(80)).optional(),
    roleType: z.string().min(1).max(40).optional(),
    briefDescription: z.string().min(1).max(1500),
    appearance: z.string().max(1500).optional(),
    personality: z.string().max(1500).optional(),
    background: z.string().max(1500).optional(),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.array(z.string().max(300)).optional(),
  })
  .passthrough();

const ExpansionResultSchema = z
  .object({
    candidates: z.array(ExpansionCandidateSchema).default([]),
  })
  .passthrough();

type ExpansionCandidate = z.infer<typeof ExpansionCandidateSchema>;
type ExpansionResult = z.infer<typeof ExpansionResultSchema>;

type NormalizedCandidate = {
  tempId: string;
  name: string;
  aliases: string[];
  roleType: string;
  briefDescription: string;
  appearance: string;
  personality: string;
  background: string;
  confidence: number;
  evidence: string[];
};

type ExpansionContext = {
  project: {
    id: string;
    summary: string;
    protagonist: string;
    style: string;
    artStyleConfig: Prisma.JsonValue | null;
    contextCache: Prisma.JsonValue | null;
  };
  characters: Array<{
    id: string;
    name: string;
    briefDescription: string | null;
    appearance: string;
    personality: string;
    background: string;
  }>;
  worldViewElements: Array<{ type: string; title: string; content: string }>;
  providerConfig: ProviderChatConfig;
  baseCache: Record<string, unknown>;
  narrativeCausalChain: unknown;
};

type ExpansionGenerationResult = {
  parsed: ExpansionResult;
  extractedJson: string;
  tokenUsage: TokenUsage | undefined;
  executionMode: 'agent' | 'legacy';
  fallbackUsed: boolean;
  agentTrace?: unknown;
  stepSummaries?: Array<{ index: number; kind: string; summary: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLen);
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeStringArray(value: unknown, maxLen: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseExpansion(raw: string): { parsed: ExpansionResult; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: ExpansionResultSchema.parse(json), extractedJson };
}

function extractCharacterNamesFromChain(chain: unknown): string[] {
  if (!isRecord(chain)) return [];
  const names = new Set<string>();
  const pushName = (value: unknown) => {
    const name = cleanText(value, 80);
    if (name) names.add(name);
  };

  if (Array.isArray(chain.characterMatrix)) {
    for (const item of chain.characterMatrix) {
      if (isRecord(item)) pushName(item.name);
    }
  }

  if (isRecord(chain.beatFlow) && Array.isArray(chain.beatFlow.acts)) {
    for (const act of chain.beatFlow.acts) {
      if (!isRecord(act) || !Array.isArray(act.beats)) continue;
      for (const beat of act.beats) {
        if (!isRecord(beat) || !Array.isArray(beat.characters)) continue;
        for (const n of beat.characters) pushName(n);
      }
    }
  }

  if (Array.isArray(chain.infoVisibilityLayers)) {
    for (const layer of chain.infoVisibilityLayers) {
      if (!isRecord(layer) || !Array.isArray(layer.roles)) continue;
      for (const role of layer.roles) pushName(role);
    }
  }

  return Array.from(names).slice(0, 80);
}

function buildLegacyUserPrompt(args: {
  projectSummary: string;
  protagonist: string;
  style: string;
  narrativeCausalChain: unknown;
  worldView: Array<{ type: string; title: string; content: string }>;
  existingCharacters: Array<{
    id: string;
    name: string;
    briefDescription: string;
    appearance: string;
    personality: string;
    background: string;
  }>;
  maxNewCharacters: number;
}): string {
  const namesFromChain = extractCharacterNamesFromChain(args.narrativeCausalChain);
  return [
    `请补充“尚未入库”的候选角色，最多 ${args.maxNewCharacters} 个。`,
    '严格输出 JSON 对象：',
    '{ "candidates": [{ "name": "...", "aliases": ["..."], "roleType": "...", "briefDescription": "...", "appearance": "...", "personality": "...", "background": "...", "confidence": 0.0-1.0, "evidence": ["来源证据"] }] }',
    '',
    '约束：',
    '1. 不要重复已有角色（同名或明显同一角色）。',
    '2. 候选角色必须来自叙事因果链/世界观的可追溯信息，不要凭空硬造。',
    '3. confidence 范围 [0,1]，evidence 至少 1 条（说明来自因果链哪一部分）。',
    '4. briefDescription 要能区分角色功能与冲突定位。',
    '',
    `项目梗概：${args.projectSummary || '-'}`,
    `主角设定：${args.protagonist || '-'}`,
    `画风：${args.style || '-'}`,
    '',
    '世界观要点：',
    args.worldView.length > 0
      ? args.worldView.map((item) => `- [${item.type || '-'}] ${item.title || '-'}：${item.content || '-'}`).join('\n')
      : '- （空）',
    '',
    '已入库角色：',
    args.existingCharacters.length > 0
      ? args.existingCharacters
          .map(
            (c) =>
              `- ${c.id} | ${c.name} | brief=${c.briefDescription || '-'} | appearance=${c.appearance || '-'} | personality=${c.personality || '-'} | background=${c.background || '-'}`,
          )
          .join('\n')
      : '- （空）',
    '',
    `因果链提及角色（仅供对照）：${namesFromChain.length > 0 ? namesFromChain.join('、') : '-'}`,
    '叙事因果链(JSON)：',
    JSON.stringify(args.narrativeCausalChain ?? null),
  ].join('\n');
}

function buildAgentUserPrompt(args: {
  projectId: string;
  maxNewCharacters: number;
  narrativeNames: string[];
}): string {
  return [
    `目标：补充候选角色，最多 ${args.maxNewCharacters} 个。`,
    '请按需调用工具读取上下文，再输出 final。',
    'final 必须是 JSON：{"candidates":[...]}',
    '候选约束：',
    '1. 不重复已有角色。',
    '2. 必须可追溯到已有因果链/世界观证据。',
    '3. 每个候选包含 name/briefDescription/roleType/confidence/evidence。',
    '',
    `projectId=${args.projectId}`,
    `因果链提及名（可选参考）：${args.narrativeNames.join('、') || '-'}`,
  ].join('\n');
}

function normalizeCandidates(
  parsed: ExpansionCandidate[],
  existingNames: Set<string>,
  maxNewCharacters: number,
): {
  normalized: NormalizedCandidate[];
  stats: {
    total: number;
    existingSkipped: number;
    duplicatesResolved: number;
    lowConfidenceSkipped: number;
    finalCount: number;
  };
} {
  const seen = new Set<string>();
  const normalized: NormalizedCandidate[] = [];
  let existingSkipped = 0;
  let duplicatesResolved = 0;
  let lowConfidenceSkipped = 0;

  for (const candidate of parsed) {
    const name = cleanText(candidate.name, 80);
    if (!name) continue;

    const nameKey = normalizeNameKey(name);
    if (!nameKey) continue;

    const confidenceRaw = typeof candidate.confidence === 'number' ? candidate.confidence : 0.75;
    const confidence = Math.max(0, Math.min(1, confidenceRaw));
    if (confidence < MIN_CONFIDENCE) {
      lowConfidenceSkipped += 1;
      continue;
    }

    if (existingNames.has(nameKey)) {
      existingSkipped += 1;
      continue;
    }

    if (seen.has(nameKey)) {
      duplicatesResolved += 1;
      continue;
    }

    seen.add(nameKey);
    normalized.push({
      tempId: `cand_${randomUUID()}`,
      name,
      aliases: normalizeStringArray(candidate.aliases, 80, 6),
      roleType: cleanText(candidate.roleType, 40) || 'supporting',
      briefDescription: cleanText(candidate.briefDescription, 1500) || '待补充',
      appearance: cleanText(candidate.appearance, 1500),
      personality: cleanText(candidate.personality, 1500),
      background: cleanText(candidate.background, 1500),
      confidence,
      evidence: normalizeStringArray(candidate.evidence, 300, 6),
    });

    if (normalized.length >= maxNewCharacters) break;
  }

  return {
    normalized,
    stats: {
      total: parsed.length,
      existingSkipped,
      duplicatesResolved,
      lowConfidenceSkipped,
      finalCount: normalized.length,
    },
  };
}

function normalizePersistedCandidates(value: unknown): NormalizedCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: NormalizedCandidate[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = cleanText(item.name, 80);
    const nameKey = normalizeNameKey(name);
    if (!nameKey) continue;
    const confidenceRaw = typeof item.confidence === 'number' ? item.confidence : 0.75;
    out.push({
      tempId: cleanText(item.tempId, 120) || `cand_${randomUUID()}`,
      name,
      aliases: normalizeStringArray(item.aliases, 80, 6),
      roleType: cleanText(item.roleType, 40) || 'supporting',
      briefDescription: cleanText(item.briefDescription, 1500) || '待补充',
      appearance: cleanText(item.appearance, 1500),
      personality: cleanText(item.personality, 1500),
      background: cleanText(item.background, 1500),
      confidence: Math.max(0, Math.min(1, confidenceRaw)),
      evidence: normalizeStringArray(item.evidence, 300, 6),
    });
  }
  return out;
}

function mergePendingCandidates(
  previous: NormalizedCandidate[],
  current: NormalizedCandidate[],
  existingNames: Set<string>,
) {
  const merged: NormalizedCandidate[] = [];
  const seen = new Set<string>();
  let carriedOver = 0;
  let duplicatesAcrossRuns = 0;

  for (const candidate of previous) {
    const nameKey = normalizeNameKey(candidate.name);
    if (!nameKey || existingNames.has(nameKey) || seen.has(nameKey)) continue;
    seen.add(nameKey);
    merged.push(candidate);
    carriedOver += 1;
  }

  for (const candidate of current) {
    const nameKey = normalizeNameKey(candidate.name);
    if (!nameKey || existingNames.has(nameKey)) continue;
    if (seen.has(nameKey)) {
      duplicatesAcrossRuns += 1;
      continue;
    }
    seen.add(nameKey);
    merged.push(candidate);
  }

  return { merged, carriedOver, duplicatesAcrossRuns };
}

async function loadExpansionContext(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
}): Promise<ExpansionContext> {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: {
      id: true,
      summary: true,
      protagonist: true,
      style: true,
      artStyleConfig: true,
      contextCache: true,
    },
  });
  if (!project) throw new Error('Project not found');

  const [characters, worldViewElements, profile] = await Promise.all([
    prisma.character.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        briefDescription: true,
        appearance: true,
        personality: true,
        background: true,
      },
    }),
    prisma.worldViewElement.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      select: { type: true, title: true, content: true },
    }),
    prisma.aIProfile.findFirst({
      where: { id: aiProfileId, teamId },
      select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
    }),
  ]);

  if (!profile) throw new Error('AI profile not found');
  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const baseCache = isRecord(project.contextCache)
    ? (project.contextCache as Record<string, unknown>)
    : {};
  const narrativeCausalChain = baseCache.narrativeCausalChain ?? null;

  return {
    project,
    characters,
    worldViewElements,
    providerConfig,
    baseCache,
    narrativeCausalChain,
  };
}

async function generateCandidatesLegacy(args: {
  prisma: PrismaClient;
  teamId: string;
  maxNewCharacters: number;
  context: ExpansionContext;
  updateProgress: (progress: JobProgress) => Promise<void>;
}): Promise<ExpansionGenerationResult> {
  const { prisma, teamId, maxNewCharacters, context, updateProgress } = args;
  await updateProgress({ pct: 5, message: '准备角色扩充提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.character_expansion.system',
  });
  const userPrompt = buildLegacyUserPrompt({
    projectSummary: context.project.summary,
    protagonist: context.project.protagonist,
    style: styleFullPrompt(context.project),
    narrativeCausalChain: context.narrativeCausalChain,
    worldView: context.worldViewElements.map((item) => ({
      type: item.type,
      title: item.title,
      content: item.content,
    })),
    existingCharacters: context.characters.map((c) => ({
      id: c.id,
      name: c.name,
      briefDescription: c.briefDescription ?? '',
      appearance: c.appearance,
      personality: c.personality,
      background: c.background,
    })),
    maxNewCharacters,
  });

  await updateProgress({ pct: 30, message: '调用 AI 生成候选角色...' });
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(context.providerConfig, messages);
  const tokenUsage = mergeTokenUsage(undefined, res.tokenUsage);
  const { parsed, extractedJson } = parseExpansion(res.content);

  return {
    parsed,
    extractedJson,
    tokenUsage,
    executionMode: 'legacy',
    fallbackUsed: false,
  };
}

function summarizeAgentSteps(trace: unknown): Array<{ index: number; kind: string; summary: string }> {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) return [];
  return trace.steps
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, idx) => {
      const kind = typeof item.kind === 'string' ? item.kind : 'unknown';
      const toolName =
        isRecord(item.toolCall) && typeof item.toolCall.name === 'string'
          ? item.toolCall.name
          : null;
      return {
        index: typeof item.index === 'number' ? item.index : idx + 1,
        kind,
        summary: toolName ? `${kind}:${toolName}` : kind,
      };
    });
}

async function generateCandidatesAgent(args: {
  prisma: PrismaClient;
  teamId: string;
  maxNewCharacters: number;
  context: ExpansionContext;
  updateProgress: (progress: JobProgress) => Promise<void>;
}): Promise<ExpansionGenerationResult> {
  const { prisma, teamId, maxNewCharacters, context, updateProgress } = args;
  await updateProgress({ pct: 5, message: '准备角色扩充 Agent...' });

  const agentSystemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.character_expansion.agent.system',
  });

  const tools = {
    read_project_basics: {
      description: '读取项目基础信息（梗概/主角/画风）',
      execute: async () => ({
        summary: context.project.summary,
        protagonist: context.project.protagonist,
        style: styleFullPrompt(context.project),
      }),
    },
    read_world_view: {
      description: '读取世界观要点',
      execute: async () => context.worldViewElements,
    },
    read_existing_characters: {
      description: '读取已有角色列表',
      execute: async () => context.characters,
    },
    read_narrative_character_names: {
      description: '读取因果链中提及角色名',
      execute: async () => extractCharacterNamesFromChain(context.narrativeCausalChain),
    },
    read_narrative_chain_chunk: {
      description: '分段读取叙事因果链 JSON 字符串',
      execute: async (input: unknown) => {
        const arg = isRecord(input) ? input : {};
        const offset = typeof arg.offset === 'number' ? Math.max(0, Math.floor(arg.offset)) : 0;
        const limit = typeof arg.limit === 'number' ? Math.max(200, Math.min(8000, Math.floor(arg.limit))) : 3000;
        const raw = JSON.stringify(context.narrativeCausalChain ?? null);
        return {
          total: raw.length,
          offset,
          limit,
          chunk: raw.slice(offset, offset + limit),
          nextOffset: Math.min(raw.length, offset + limit),
        };
      },
    },
  };

  const initialMessages: ChatMessage[] = [
    { role: 'system', content: agentSystemPrompt },
    {
      role: 'user',
      content: buildAgentUserPrompt({
        projectId: context.project.id,
        maxNewCharacters,
        narrativeNames: extractCharacterNamesFromChain(context.narrativeCausalChain),
      }),
    },
  ];

  await updateProgress({ pct: 20, message: '角色扩充 Agent 规划中...' });

  const loop = await runJsonToolLoop<{
    parsed: ExpansionResult;
    extractedJson: string;
    tokenUsage: TokenUsage | undefined;
  }>({
    initialMessages,
    callModel: async (messages, meta) => {
      await updateProgress({
        pct: Math.min(70, 20 + meta.stepIndex * 10),
        message: `角色扩充 Agent 执行步骤 ${meta.stepIndex}...`,
      });
      return await chatWithProvider(context.providerConfig, messages);
    },
    tools,
    maxSteps: getAgentMaxSteps(),
    stepTimeoutMs: getAgentStepTimeoutMs(),
    totalTimeoutMs: getAgentTotalTimeoutMs(),
    parseFinal: (value) => {
      const parsed = ExpansionResultSchema.parse(value);
      return {
        parsed,
        extractedJson: JSON.stringify(value),
        tokenUsage: undefined,
      };
    },
    fallbackEnabled: isAgentFallbackToLegacyEnabled(),
    fallback: async () => {
      const legacy = await generateCandidatesLegacy({
        prisma,
        teamId,
        maxNewCharacters,
        context,
        updateProgress,
      });
      return {
        final: {
          parsed: legacy.parsed,
          extractedJson: legacy.extractedJson,
          tokenUsage: legacy.tokenUsage,
        },
        reason: 'agent_failed_use_legacy',
      };
    },
  });

  const tokenUsage =
    loop.executionMode === 'legacy'
      ? mergeTokenUsage(loop.tokenUsage, loop.final.tokenUsage)
      : loop.tokenUsage;

  return {
    parsed: loop.final.parsed,
    extractedJson: loop.final.extractedJson,
    tokenUsage,
    executionMode: loop.executionMode,
    fallbackUsed: loop.fallbackUsed,
    agentTrace: loop.trace,
    stepSummaries: summarizeAgentSteps(loop.trace),
  };
}

export async function expandStoryCharacters(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  maxNewCharacters?: number;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;
  const maxNewCharacters = Math.max(
    1,
    Math.min(MAX_NEW_CHARACTERS_LIMIT, Math.floor(args.maxNewCharacters ?? MAX_NEW_CHARACTERS_DEFAULT)),
  );

  const context = await loadExpansionContext({
    prisma,
    teamId,
    projectId,
    aiProfileId,
    apiKeySecret,
  });

  const generation = isAgentCharacterExpansionEnabled()
    ? await generateCandidatesAgent({
      prisma,
      teamId,
      maxNewCharacters,
      context,
      updateProgress,
    })
    : await generateCandidatesLegacy({
      prisma,
      teamId,
      maxNewCharacters,
      context,
      updateProgress,
    });

  const existingNames = new Set(
    context.characters.map((c) => normalizeNameKey(c.name)).filter((name) => Boolean(name)),
  );
  const { normalized, stats } = normalizeCandidates(
    generation.parsed.candidates as ExpansionCandidate[],
    existingNames,
    maxNewCharacters,
  );
  const previousCandidates = isRecord(context.baseCache.characterExpansion)
    ? normalizePersistedCandidates(context.baseCache.characterExpansion.candidates)
    : [];
  const { merged, carriedOver, duplicatesAcrossRuns } = mergePendingCandidates(
    previousCandidates,
    normalized,
    existingNames,
  );

  await updateProgress({ pct: 80, message: '写入候选角色缓存...' });
  const generatedAt = new Date().toISOString();
  const characterExpansion = {
    runId: randomUUID(),
    generatedAt,
    source: 'narrative_causal_chain',
    maxNewCharacters,
    candidates: merged,
    stats: {
      ...stats,
      duplicatesResolved: stats.duplicatesResolved + duplicatesAcrossRuns,
      carriedOver,
      finalCount: merged.length,
    },
  };

  const nextContextCache: Record<string, unknown> = {
    ...context.baseCache,
    characterExpansion,
    characterExpansionUpdatedAt: generatedAt,
  };

  await prisma.project.update({
    where: { id: projectId },
    data: { contextCache: nextContextCache as unknown as Prisma.InputJsonValue },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    projectId,
    candidateCount: merged.length,
    stats: characterExpansion.stats,
    extractedJson: generation.extractedJson,
    tokenUsage: generation.tokenUsage ?? null,
    executionMode: generation.executionMode,
    fallbackUsed: generation.fallbackUsed,
    agentTrace: generation.agentTrace ?? null,
    stepSummaries: generation.stepSummaries ?? [],
  };
}
