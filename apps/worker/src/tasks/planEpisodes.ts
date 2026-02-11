import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { z } from 'zod';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { EpisodePlanSchema, type EpisodePlan } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

const MAX_EPISODE_COUNT = 100;
const CHUNK_MODE_THRESHOLD = 12;

function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

function schemaEpisodePlan(targetEpisodeCount?: number): Record<string, unknown> {
  const count = typeof targetEpisodeCount === 'number' ? targetEpisodeCount : undefined;
  const maybeConst = count ? { const: count } : {};
  const minMax = count ? { minItems: count, maxItems: count } : { minItems: 1, maxItems: MAX_EPISODE_COUNT };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['episodeCount', 'episodes'],
    properties: {
      episodeCount: { type: 'integer', minimum: 1, maximum: MAX_EPISODE_COUNT, ...maybeConst },
      reasoningBrief: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      episodes: {
        type: 'array',
        ...minMax,
        items: {
          type: 'object',
            additionalProperties: false,
            required: ['order', 'title', 'logline', 'mainCharacters', 'beats', 'sceneScope', 'cliffhanger'],
            properties: {
              order: { type: 'integer', minimum: 1, maximum: MAX_EPISODE_COUNT },
              title: { type: 'string' },
              logline: { type: 'string' },
              mainCharacters: { type: 'array', items: { type: 'string' } },
            beats: { type: 'array', items: { type: 'string' } },
            sceneScope: { type: 'string' },
            cliffhanger: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
    },
  };
}

function schemaEpisodePlanBatch(
  startOrder: number,
  batchCount: number,
  maxEpisodeCount: number,
): Record<string, unknown> {
  const endOrder = startOrder + batchCount - 1;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['batchStartOrder', 'batchCount', 'episodes'],
    properties: {
      batchStartOrder: { type: 'integer', const: startOrder },
      batchCount: { type: 'integer', const: batchCount },
      reasoningBrief: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      episodes: {
        type: 'array',
        minItems: batchCount,
        maxItems: batchCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['order', 'title', 'logline', 'mainCharacters', 'beats', 'sceneScope', 'cliffhanger'],
          properties: {
            order: { type: 'integer', minimum: startOrder, maximum: Math.min(endOrder, maxEpisodeCount) },
            title: { type: 'string' },
            logline: { type: 'string' },
            mainCharacters: { type: 'array', items: { type: 'string' } },
            beats: { type: 'array', items: { type: 'string' } },
            sceneScope: { type: 'string' },
            cliffhanger: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
    },
  };
}

function stableJsonFixConfig(base: ReturnType<typeof toProviderChatConfig>): ReturnType<typeof toProviderChatConfig> {
  const next = { ...base } as ReturnType<typeof toProviderChatConfig>;
  const model = String(next.model ?? '').toLowerCase();
  const effort = model.includes('gpt-5.2') || model.includes('gpt5.2') ? 'none' : ('minimal' as const);
  next.params = {
    ...(next.params ?? {}),
    temperature: 0,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    reasoningEffort: effort,
  };
  return next;
}

function parseEpisodePlan(raw: string): { parsed: EpisodePlan; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: EpisodePlanSchema.parse(json), extractedJson };
}

const EpisodeBatchItemSchema = z.object({
  order: z.number().int().min(1).max(MAX_EPISODE_COUNT),
  title: z.string().min(1).max(200),
  logline: z.string().min(1).max(2000),
  mainCharacters: z.array(z.string().min(1).max(200)).default([]),
  beats: z.array(z.string().min(1).max(500)).default([]),
  sceneScope: z.string().min(1).max(2000),
  cliffhanger: z.string().min(0).max(2000).optional().nullable(),
});

const EpisodePlanBatchSchema = z
  .object({
    batchStartOrder: z.number().int().min(1),
    batchCount: z.number().int().min(1).max(20),
    reasoningBrief: z.string().min(0).max(2000).optional().nullable(),
    episodes: z.array(EpisodeBatchItemSchema).min(1).max(20),
  })
  .superRefine((val, ctx) => {
    if (val.batchCount !== val.episodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['batchCount'],
        message: 'batchCount must equal episodes.length',
      });
    }
    const expectedOrders = Array.from({ length: val.batchCount }, (_, idx) => val.batchStartOrder + idx);
    const actualOrders = val.episodes.map((episode) => episode.order);
    for (let i = 0; i < expectedOrders.length; i += 1) {
      if (actualOrders[i] !== expectedOrders[i]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['episodes'],
          message: 'episodes.order must be continuous from batchStartOrder..batchStartOrder+batchCount-1',
        });
        break;
      }
    }
  });

type EpisodePlanBatch = z.infer<typeof EpisodePlanBatchSchema>;

function parseEpisodePlanBatch(raw: string): { parsed: EpisodePlanBatch; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: EpisodePlanBatchSchema.parse(json), extractedJson };
}

type EpisodeDedupeIssue = {
  aOrder: number;
  bOrder: number;
  similarity: number;
  aTitle: string;
  bTitle: string;
};

function normalizeForSimilarity(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function buildBigramSet(text: string): Set<string> {
  const s = normalizeForSimilarity(text);
  const out = new Set<string>();
  if (!s) return out;
  if (s.length < 2) {
    out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i += 1) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function textSimilarity(a: string, b: string): number {
  return jaccardSimilarity(buildBigramSet(a), buildBigramSet(b));
}

function episodeSignature(ep: EpisodePlan['episodes'][number]): string {
  const beats = Array.isArray(ep.beats) ? ep.beats.join(' ') : '';
  return [ep.title, ep.logline, ep.sceneScope, beats].filter(Boolean).join(' ');
}

function findEpisodeDedupeIssues(episodes: EpisodePlan['episodes']): {
  issues: EpisodeDedupeIssue[];
  rewriteOrders: number[];
} {
  const issues: EpisodeDedupeIssue[] = [];
  const rewrite = new Set<number>();
  const threshold = 0.58;

  for (let i = 0; i < episodes.length; i += 1) {
    for (let j = i + 1; j < episodes.length; j += 1) {
      const a = episodes[i];
      const b = episodes[j];
      const sim = textSimilarity(episodeSignature(a), episodeSignature(b));
      if (sim < threshold) continue;
      issues.push({
        aOrder: a.order,
        bOrder: b.order,
        similarity: sim,
        aTitle: a.title,
        bTitle: b.title,
      });
      // 倾向保留更早的集，改写更晚的集（减少连锁影响）
      rewrite.add(b.order);
    }
  }

  const rewriteOrders = Array.from(rewrite).sort((a, b) => a - b);
  issues.sort((a, b) => b.similarity - a.similarity);
  return { issues, rewriteOrders };
}

function buildEpisodeDedupeUserPrompt(args: {
  episodePlanJson: string;
  rewriteOrders: number[];
  issues: EpisodeDedupeIssue[];
}): string {
  const clip = (s: string, max = 80) => (s.length > max ? `${s.slice(0, max)}…` : s);
  return [
    '当前 EpisodePlan JSON：',
    '<<<',
    args.episodePlanJson.trim(),
    '>>>',
    '',
    `需要改写的集数（order）：${args.rewriteOrders.join(', ')}`,
    '',
    '重复度报告（节选）：',
    ...args.issues.slice(0, 10).map((i) => {
      const score = i.similarity.toFixed(2);
      return `- 第${i.aOrder}集「${clip(i.aTitle)}」 vs 第${i.bOrder}集「${clip(i.bTitle)}」 similarity=${score}`;
    }),
    '',
    '请输出修订后的 EpisodePlan JSON：',
  ].join('\n');
}

function formatWorldView(items: Array<{ type: string; title: string; content: string; order: number }>): string {
  if (items.length === 0) return '-';
  return items
    .map((it) => `- (${it.order}) [${it.type}] ${it.title}: ${String(it.content ?? '').slice(0, 400)}`)
    .join('\n');
}

function formatCharacters(items: Array<{ name: string; appearance: string; personality: string; background: string }>): string {
  if (items.length === 0) return '-';
  return items
    .map((c) => {
      const parts = [
        c.appearance ? `外观: ${c.appearance}` : '',
        c.personality ? `性格: ${c.personality}` : '',
        c.background ? `背景: ${c.background}` : '',
      ].filter(Boolean);
      return `- ${c.name}${parts.length ? `（${parts.join('；').slice(0, 600)}）` : ''}`;
    })
    .join('\n');
}

function formatNarrativeCausalChain(contextCache: Prisma.JsonValue | null): string {
  if (!contextCache || !isRecord(contextCache)) return '-';
  const chain = contextCache['narrativeCausalChain'];
  if (!chain) return '-';
  if (!isRecord(chain)) return String(chain);

  // 智能策略：若全量 JSON（压缩）足够短，则直接喂给模型（信息最完整，且不会“半截截断”）
  try {
    const compact = JSON.stringify(chain);
    if (compact.length <= 12000) return compact;
  } catch {
    // fallthrough to summary
  }

  const clip = (v: unknown, max = 140) => {
    const s = (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
    if (!s) return '';
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };

  const pushUntil = (lines: string[], maxLen = 12000): string => {
    let out = '';
    for (const line of lines) {
      const next = out ? `${out}\n${line}` : line;
      if (next.length > maxLen) {
        return out ? `${out}\n...TRUNCATED...` : '...TRUNCATED...';
      }
      out = next;
    }
    return out || '-';
  };

  const lines: string[] = [];
  const completedPhase = chain.completedPhase;
  const validationStatus = chain.validationStatus;
  lines.push(
    `【叙事因果链摘要】阶段进度：${typeof completedPhase === 'number' ? completedPhase : '-'
    }/4；自洽校验：${typeof validationStatus === 'string' ? validationStatus : '-'}`,
  );

  if (typeof chain.outlineSummary === 'string' && chain.outlineSummary.trim()) {
    lines.push(`- 大纲摘要：${clip(chain.outlineSummary, 800)}`);
  }

  const conflict = chain.conflictEngine;
  if (isRecord(conflict)) {
    lines.push(`- 核心冲突物件/事件：${clip(conflict.coreObjectOrEvent, 120) || '-'}`);

    const firstMover = conflict.firstMover;
    if (isRecord(firstMover)) {
      const initiator = clip(firstMover.initiator, 40);
      const hiddenIntent = clip(firstMover.hiddenIntent, 120);
      if (initiator || hiddenIntent) {
        lines.push(`- 第一推动因：${initiator || '-'}（真实意图：${hiddenIntent || '-'}）`);
      }
    }

    const stakes = conflict.stakesByFaction;
    if (isRecord(stakes)) {
      const entries = Object.entries(stakes)
        .slice(0, 8)
        .map(([k, v]) => `  - ${clip(k, 60)}：${clip(v, 180)}`);
      if (entries.length) {
        lines.push('- 各方利害：');
        lines.push(...entries);
      }
    }
  }

  const layers = chain.infoVisibilityLayers;
  if (Array.isArray(layers) && layers.length) {
    lines.push('- 信息层级（从高到低）：');
    for (const l of layers.slice(0, 6)) {
      if (!isRecord(l)) continue;
      const layerName = clip(l.layerName, 40) || '未命名层';
      const roles = Array.isArray(l.roles) ? l.roles.map((r) => clip(r, 30)).filter(Boolean).join('、') : '';
      const blind = clip(l.blindSpot, 120);
      lines.push(`  - ${layerName}${roles ? `：${roles}` : ''}${blind ? `（盲区：${blind}）` : ''}`);
    }
  }

  const beatFlow = chain.beatFlow;
  if (isRecord(beatFlow)) {
    const actMode = clip(beatFlow.actMode, 16);
    lines.push(`- 节拍结构：${actMode || '-'}（每条=节拍，括号内为冲突升级/地点/在场角色）`);
    const acts = beatFlow.acts;
    if (Array.isArray(acts)) {
      for (const a of acts.slice(0, 4)) {
        if (!isRecord(a)) continue;
        const actNo = a.act;
        const actName = clip(a.actName, 24);
        lines.push(`  第${typeof actNo === 'number' ? actNo : '-'}幕${actName ? `「${actName}」` : ''}：`);
        const beats = a.beats;
        if (!Array.isArray(beats) || beats.length === 0) {
          lines.push('    （无节拍）');
          continue;
        }
        for (const b of beats.slice(0, 8)) {
          if (!isRecord(b)) continue;
          const name = clip(b.beatName, 60) || '未命名节拍';
          const esc = b.escalation;
          const loc = clip(b.location, 30);
          const chars = Array.isArray(b.characters) ? b.characters.map((c) => clip(c, 16)).filter(Boolean).join('、') : '';
          const suffix = [
            typeof esc === 'number' ? `升${esc}` : '',
            loc ? `@${loc}` : '',
            chars ? chars : '',
          ].filter(Boolean).join(' / ');
          lines.push(`    · ${name}${suffix ? `（${suffix}）` : ''}`);
        }
      }
    }
  }

  const plotLines = chain.plotLines;
  if (Array.isArray(plotLines) && plotLines.length) {
    lines.push('- 叙事线：');
    for (const pl of plotLines.slice(0, 6)) {
      if (!isRecord(pl)) continue;
      const type = clip(pl.lineType, 12) || '-';
      const driver = clip(pl.driver, 20) || '-';
      const stated = clip(pl.statedGoal, 80);
      const trueGoal = clip(pl.trueGoal, 80);
      const interlocks = Array.isArray(pl.keyInterlocks)
        ? pl.keyInterlocks.map((x) => clip(x, 30)).filter(Boolean).join('、')
        : '';
      lines.push(`  - ${type}：${driver}${stated ? `（表：${stated}` : ''}${trueGoal ? `；里：${trueGoal}` : ''}${stated || trueGoal ? '）' : ''}`);
      if (interlocks) lines.push(`    咬合：${interlocks}`);
    }
  }

  return pushUntil(lines, 12000);
}

function buildUserPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  targetEpisodeCount?: number;
}): string {
  return [
    typeof args.targetEpisodeCount === 'number'
      ? `targetEpisodeCount（如设置则必须严格输出该集数）：${args.targetEpisodeCount}`
      : '',
    '全局设定：',
    '- 故事梗概：',
    args.storySynopsis || '-',
    '',
    '- 画风（完整提示词）：',
    args.artStyle || '-',
    '',
    '- 世界观要素：',
    args.worldView || '-',
    '',
    '- 角色库：',
    args.characters || '-',
    '',
    '- 叙事因果链（结构化叙事骨架；若提供，请尽量保持一致，避免引入与其冲突的新核心矛盾）：',
    args.narrativeCausalChain ?? '-',
  ]
    .filter(Boolean)
    .join('\n');
}

function resolvePlanChunkSize(targetEpisodeCount: number): number {
  if (targetEpisodeCount <= 16) return 8;
  if (targetEpisodeCount <= 60) return 10;
  return 12;
}

function formatPlannedEpisodesBrief(episodes: EpisodePlan['episodes']): string {
  if (episodes.length === 0) return '-';
  return episodes
    .slice(0, 80)
    .map((episode) => {
      const title = episode.title.length > 60 ? `${episode.title.slice(0, 60)}…` : episode.title;
      const logline = episode.logline.length > 100 ? `${episode.logline.slice(0, 100)}…` : episode.logline;
      return `- 第${episode.order}集《${title}》：${logline}`;
    })
    .join('\n');
}

function buildBatchUserPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  targetEpisodeCount: number;
  batchStartOrder: number;
  batchCount: number;
  plannedEpisodes: EpisodePlan['episodes'];
}): string {
  const batchEndOrder = args.batchStartOrder + args.batchCount - 1;
  return [
    `总目标集数：${args.targetEpisodeCount}`,
    `本轮仅生成第 ${args.batchStartOrder}-${batchEndOrder} 集，共 ${args.batchCount} 集。`,
    '必须只输出当前批次的 JSON，不要输出全量剧集。',
    '约束：',
    '- batchStartOrder 必须等于当前起始集',
    '- batchCount 必须等于当前批次数',
    '- episodes.order 必须连续且仅覆盖当前区间',
    '- 已规划剧集不可重写，不可改 order',
    '',
    '已规划剧集摘要（只读）：',
    formatPlannedEpisodesBrief(args.plannedEpisodes),
    '',
    '全局设定：',
    '- 故事梗概：',
    args.storySynopsis || '-',
    '',
    '- 画风（完整提示词）：',
    args.artStyle || '-',
    '',
    '- 世界观要素：',
    args.worldView || '-',
    '',
    '- 角色库：',
    args.characters || '-',
    '',
    '- 叙事因果链：',
    args.narrativeCausalChain ?? '-',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildJsonFixUserPrompt(raw: string): string {
  return ['原始输出：', '<<<', raw?.trim() ?? '', '>>>'].join('\n');
}

function withMinimumMaxTokens(config: ReturnType<typeof toProviderChatConfig>, minMaxTokens: number) {
  const current = config.params?.maxTokens;
  if (typeof current === 'number' && current >= minMaxTokens) return config;
  return {
    ...config,
    params: {
      ...(config.params ?? {}),
      maxTokens: minMaxTokens,
    },
  };
}

function deepseekOutputPolicy(model: string): { defaultMaxTokens: number; maxMaxTokens: number } {
  const m = (model ?? '').toLowerCase();
  // 业务约定：deepseek-chat 默认 4K / 最大 8K；deepseek-reasoner 默认 32K / 最大 64K
  if (m.includes('reasoner')) return { defaultMaxTokens: 32768, maxMaxTokens: 65536 };
  return { defaultMaxTokens: 4096, maxMaxTokens: 8192 };
}

export async function planEpisodes(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  options?: { targetEpisodeCount?: number };
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const worldViewElements = await prisma.worldViewElement.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { type: true, title: true, content: true, order: true },
  });

  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { name: true, appearance: true, personality: true, background: true },
  });

  await updateProgress({ pct: 5, message: '准备提示词...' });
  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const baseConfig = toProviderChatConfig(profile);
  baseConfig.apiKey = apiKey;
  const targetCount = Math.max(
    1,
    Math.min(MAX_EPISODE_COUNT, Math.floor(args.options?.targetEpisodeCount ?? 12)),
  );
  const storySynopsis = project.summary;
  const artStyle = styleFullPrompt(project);
  const worldView = formatWorldView(worldViewElements);
  const charactersText = formatCharacters(characters);
  const narrativeCausalChain = formatNarrativeCausalChain(project.contextCache);

  // Episode Plan 输出可能很长：为避免被 maxTokens 截断导致 JSON 未闭合，设置“不会低于模型默认值”的最低输出上限。
  let providerConfig = baseConfig;

  if (profile.provider === 'deepseek') {
    const policy = deepseekOutputPolicy(profile.model);
    const desired = Math.min(policy.maxMaxTokens, Math.max(policy.defaultMaxTokens, targetCount * 320));
    providerConfig = withMinimumMaxTokens(baseConfig, desired);
  } else if (typeof baseConfig.params?.maxTokens === 'number') {
    // 非 DeepSeek：仅在用户显式设置 maxTokens 时做保底，避免把供应商默认值反向压小
    const desired = Math.max(1800, Math.min(20000, targetCount * 320));
    providerConfig = withMinimumMaxTokens(baseConfig, desired);
  }

  if (targetCount > CHUNK_MODE_THRESHOLD) {
    const chunkSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.plan_episodes.chunk.system',
    });
    const chunkFixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.plan_episodes.chunk_fix.system',
    });

    const chunkSize = resolvePlanChunkSize(targetCount);
    const chunkCount = Math.ceil(targetCount / chunkSize);
    const plannedEpisodes: EpisodePlan['episodes'] = [];
    let reasoningBrief: string | null = null;
    let tokenUsage: ReturnType<typeof mergeTokenUsage> = undefined;
    let fixed = false;

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const batchStartOrder = chunkIndex * chunkSize + 1;
      const batchCount = Math.min(chunkSize, targetCount - chunkIndex * chunkSize);
      const batchUserPrompt = buildBatchUserPrompt({
        storySynopsis,
        artStyle,
        worldView,
        characters: charactersText,
        narrativeCausalChain,
        targetEpisodeCount: targetCount,
        batchStartOrder,
        batchCount,
        plannedEpisodes,
      });
      const chunkConfig = {
        ...providerConfig,
        responseFormat: jsonSchemaFormat(
          'episode_plan_batch',
          schemaEpisodePlanBatch(batchStartOrder, batchCount, targetCount),
        ),
      };

      const startPct = 15 + Math.floor((chunkIndex / Math.max(1, chunkCount)) * 60);
      await updateProgress({
        pct: startPct,
        message: `生成剧集规划分批 ${chunkIndex + 1}/${chunkCount}（第${batchStartOrder}集起）...`,
      });

      const messages: ChatMessage[] = [
        { role: 'system', content: chunkSystemPrompt },
        { role: 'user', content: batchUserPrompt },
      ];
      const res = await chatWithProvider(chunkConfig, messages);
      if (!res.content?.trim()) {
        throw new Error(
          `AI 返回空内容（chunk ${chunkIndex + 1}/${chunkCount}）。请检查模型/供应商可用性。`,
        );
      }
      tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage);

      let parsedChunk: EpisodePlanBatch | null = null;
      let chunkExtractedJson: string | null = null;
      try {
        ({ parsed: parsedChunk, extractedJson: chunkExtractedJson } = parseEpisodePlanBatch(res.content));
      } catch (err) {
        let lastErr: unknown = err;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          await updateProgress({
            pct: Math.min(90, startPct + attempt),
            message: `修复分批 JSON（chunk ${chunkIndex + 1}/${chunkCount}，第${attempt}/2次）...`,
          });
          const fixedRes = await chatWithProvider(stableJsonFixConfig(chunkConfig), [
            { role: 'system', content: chunkFixSystemPrompt },
            { role: 'user', content: buildJsonFixUserPrompt(res.content) },
          ]);
          tokenUsage = mergeTokenUsage(tokenUsage, fixedRes.tokenUsage);
          if (!fixedRes.content?.trim()) {
            lastErr = new Error(`分批 JSON 修复失败（chunk ${chunkIndex + 1} 返回空内容）`);
            continue;
          }
          try {
            ({ parsed: parsedChunk, extractedJson: chunkExtractedJson } = parseEpisodePlanBatch(
              fixedRes.content,
            ));
            fixed = true;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!parsedChunk) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      }

      if (!parsedChunk || !chunkExtractedJson) {
        throw new Error(`剧集规划分批解析失败（chunk ${chunkIndex + 1}/${chunkCount}）`);
      }
      if (parsedChunk.batchStartOrder !== batchStartOrder || parsedChunk.batchCount !== batchCount) {
        throw new Error(
          `剧集规划分批校验失败（chunk ${chunkIndex + 1}/${chunkCount}）：batch metadata mismatch`,
        );
      }

      if (!reasoningBrief && typeof parsedChunk.reasoningBrief === 'string' && parsedChunk.reasoningBrief.trim()) {
        reasoningBrief = parsedChunk.reasoningBrief.trim();
      }
      plannedEpisodes.push(...(parsedChunk.episodes as EpisodePlan['episodes']));
    }

    const finalPlan = EpisodePlanSchema.parse({
      episodeCount: targetCount,
      reasoningBrief,
      episodes: plannedEpisodes,
    });

    await updateProgress({ pct: 85, message: '写入数据库...' });
    const finalByOrder = new Map(finalPlan.episodes.map((episode) => [episode.order, episode] as const));
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (let order = 1; order <= targetCount; order += 1) {
        const episode = finalByOrder.get(order);
        if (!episode) continue;
        await tx.episode.upsert({
          where: { projectId_order: { projectId, order } },
          update: {
            title: episode.title,
            summary: episode.logline,
            outline: episode,
            workflowState: 'IDLE',
          },
          create: {
            projectId,
            order,
            title: episode.title,
            summary: episode.logline,
            outline: episode,
            workflowState: 'IDLE',
          },
        });
      }
      await tx.episode.deleteMany({ where: { projectId, order: { gt: targetCount } } });
      await tx.project.update({ where: { id: projectId }, data: { workflowState: 'EPISODE_PLAN_EDITING' } });
    });

    await updateProgress({ pct: 100, message: '完成' });
    const extractedJson = JSON.stringify(finalPlan);
    return {
      episodeCount: finalPlan.episodeCount,
      episodes: finalPlan.episodes,
      parsed: finalPlan,
      raw: extractedJson,
      extractedJson,
      fixed,
      tokenUsage: tokenUsage ?? null,
      planningMode: 'agent_chunk_loop' as const,
      chunkCount,
    };
  }

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.plan_episodes.system',
  });

  const userPrompt = buildUserPrompt({
    storySynopsis,
    artStyle,
    worldView,
    characters: charactersText,
    narrativeCausalChain,
    targetEpisodeCount: targetCount,
  });

  // 强制结构化输出：用 JSON Schema 约束模型返回的 JSON（减少语法错误/字段漂移）
  providerConfig = {
    ...providerConfig,
    responseFormat: jsonSchemaFormat('episode_plan', schemaEpisodePlan(targetCount)),
  };

  await updateProgress({ pct: 25, message: '调用 AI 生成剧集规划...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);
  if (!res.content?.trim()) {
    throw new Error('AI 返回空内容（content 为空）。请检查模型/供应商可用性，或稍后重试。');
  }
  let tokenUsage = res.tokenUsage;
  let finalRaw = res.content;

  await updateProgress({ pct: 55, message: '解析输出...' });

  let parsed: EpisodePlan | null = null;
  let extractedJson: string | null = null;
  let fixed = false;
  let lastParseError: string | null = null;
  try {
    ({ parsed, extractedJson } = parseEpisodePlan(res.content));
  } catch (err) {
    lastParseError = err instanceof Error ? err.message : String(err);
    const fixConfig = stableJsonFixConfig(providerConfig);
    const fixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.plan_episodes.json_fix.system',
    });
    let lastErr: unknown = err;
    let ok = false;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await updateProgress({ pct: 60 + attempt, message: `尝试修复 JSON 输出（第${attempt}/3次）...` });
      const fixMessages: ChatMessage[] = [
        { role: 'system', content: fixSystemPrompt },
        { role: 'user', content: buildJsonFixUserPrompt(res.content) },
      ];
      const fixedRes = await chatWithProvider(fixConfig, fixMessages);
      if (!fixedRes.content?.trim()) {
        lastErr = new Error(
          `AI 修复阶段返回空内容（content 为空）。上一次解析错误：${lastParseError ?? 'unknown'}`,
        );
        continue;
      }
      tokenUsage = mergeTokenUsage(tokenUsage, fixedRes.tokenUsage);
      try {
        ({ parsed, extractedJson } = parseEpisodePlan(fixedRes.content));
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    fixed = true;
  }

  if (!parsed || !extractedJson) {
    throw new Error('剧集规划解析失败：结果为空');
  }

  // ===================== 去重优化：避免多集“换皮复述” =====================
  await updateProgress({ pct: 62, message: '检查集间重复度...' });
  const dedupe = parsed.episodes.length > 1 ? findEpisodeDedupeIssues(parsed.episodes) : { issues: [], rewriteOrders: [] };
  if (dedupe.rewriteOrders.length > 0) {
    await updateProgress({
      pct: 68,
      message: `检测到规划重复度偏高，正在去重优化（改写 ${dedupe.rewriteOrders.length} 集）...`,
    });

    const dedupeSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.plan_episodes.dedupe.system',
    });
    const dedupeUserPrompt = buildEpisodeDedupeUserPrompt({
      episodePlanJson: extractedJson,
      rewriteOrders: dedupe.rewriteOrders,
      issues: dedupe.issues,
    });

    const dedupeRes = await chatWithProvider(providerConfig, [
      { role: 'system', content: dedupeSystemPrompt },
      { role: 'user', content: dedupeUserPrompt },
    ]);
    tokenUsage = mergeTokenUsage(tokenUsage, dedupeRes.tokenUsage);

    try {
      const deduped = parseEpisodePlan(dedupeRes.content);
      parsed = deduped.parsed;
      extractedJson = deduped.extractedJson;
      finalRaw = dedupeRes.content;
    } catch {
      // 若去重输出反而不可解析，则保留原规划（避免阻塞主流程）
      await updateProgress({ pct: 70, message: '去重优化输出解析失败，已回退保留原规划继续落库。' });
    }
  }

  await updateProgress({ pct: 80, message: '写入数据库...' });

  const episodeCount = parsed.episodeCount;
  const planByOrder = new Map(parsed.episodes.map((e) => [e.order, e] as const));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Upsert 1..N
    for (let order = 1; order <= episodeCount; order += 1) {
      const ep = planByOrder.get(order);
      if (!ep) continue;

      await tx.episode.upsert({
        where: { projectId_order: { projectId, order } },
        update: {
          title: ep.title,
          summary: ep.logline,
          outline: ep,
          workflowState: 'IDLE',
        },
        create: {
          projectId,
          order,
          title: ep.title,
          summary: ep.logline,
          outline: ep,
          workflowState: 'IDLE',
        },
      });
    }

    // Delete episodes beyond N
    await tx.episode.deleteMany({ where: { projectId, order: { gt: episodeCount } } });

    await tx.project.update({ where: { id: projectId }, data: { workflowState: 'EPISODE_PLAN_EDITING' } });
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeCount: parsed.episodeCount,
    episodes: parsed.episodes,
    parsed,
    raw: finalRaw,
    extractedJson,
    fixed,
    tokenUsage: tokenUsage ?? null,
  };
}
