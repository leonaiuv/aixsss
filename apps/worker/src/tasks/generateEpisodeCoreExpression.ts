import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { CoreExpressionSchema, type CoreExpression } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';

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

function schemaCoreExpression(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['theme', 'emotionalArc', 'coreConflict', 'payoff', 'visualMotifs', 'endingBeat', 'nextHook'],
    properties: {
      theme: { type: 'string' },
      emotionalArc: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
      coreConflict: { type: 'string' },
      payoff: { type: 'array', items: { type: 'string' } },
      visualMotifs: { type: 'array', items: { type: 'string' } },
      endingBeat: { type: 'string' },
      nextHook: { anyOf: [{ type: 'string' }, { type: 'null' }] },
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

function parseCoreExpression(raw: string): { parsed: CoreExpression; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: CoreExpressionSchema.parse(json), extractedJson };
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

function formatNarrativeCausalChain(contextCache: unknown): string {
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
  lines.push('【叙事因果链摘要】（用于保持一致性，不要求逐字照搬）');

  if (typeof chain.outlineSummary === 'string' && chain.outlineSummary.trim()) {
    lines.push(`- 大纲摘要：${clip(chain.outlineSummary, 800)}`);
  }

  const conflict = chain.conflictEngine;
  if (isRecord(conflict)) {
    lines.push(`- 核心冲突物件/事件：${clip(conflict.coreObjectOrEvent, 120) || '-'}`);
  }

  const beatFlow = chain.beatFlow;
  if (isRecord(beatFlow)) {
    const acts = beatFlow.acts;
    if (Array.isArray(acts) && acts.length) {
      lines.push('- 节拍名称（按幕）：');
      for (const a of acts.slice(0, 4)) {
        if (!isRecord(a)) continue;
        const actNo = a.act;
        const actName = clip(a.actName, 24);
        const beats = Array.isArray(a.beats)
          ? a.beats
            .slice(0, 10)
            .map((b) => (isRecord(b) ? clip(b.beatName, 60) : ''))
            .filter(Boolean)
            .join('、')
          : '';
        lines.push(`  第${typeof actNo === 'number' ? actNo : '-'}幕${actName ? `「${actName}」` : ''}：${beats || '（无）'}`);
      }
    }
  }

  const plotLines = chain.plotLines;
  if (Array.isArray(plotLines) && plotLines.length) {
    lines.push('- 叙事线（驱动者/咬合点）：');
    for (const pl of plotLines.slice(0, 6)) {
      if (!isRecord(pl)) continue;
      const type = clip(pl.lineType, 12) || '-';
      const driver = clip(pl.driver, 20) || '-';
      const interlocks = Array.isArray(pl.keyInterlocks)
        ? pl.keyInterlocks.map((x) => clip(x, 30)).filter(Boolean).join('、')
        : '';
      lines.push(`  - ${type}：${driver}${interlocks ? `（${interlocks}）` : ''}`);
    }
  }

  return pushUntil(lines, 12000);
}

const TRUNCATION_MARK = '…【截断】';

function clipString(value: string, max: number, marker = TRUNCATION_MARK): string {
  const maxLen = Math.max(0, Math.floor(max));
  if (value.length <= maxLen) return value;
  if (maxLen === 0) return '';
  if (maxLen <= marker.length) return marker.slice(0, maxLen);
  return `${value.slice(0, maxLen - marker.length)}${marker}`;
}

export function clipText(input: unknown, max = 400): string {
  const s = (typeof input === 'string' ? input : input == null ? '' : String(input)).trim();
  if (!s) return '-';
  return clipString(s, max);
}

export function clipJson(input: unknown, max = 2000): string {
  if (input == null) return 'null';
  try {
    const s = JSON.stringify(input);
    return clipString(s, max);
  } catch {
    return clipText(input, max);
  }
}

function formatOptionalSeasonArc(value: unknown, max = 1200): string {
  if (value == null) return '-';
  if (typeof value === 'string') return clipText(value, max);
  return clipJson(value, max);
}

export function buildEpisodeCoreExpressionPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  protagonistCore?: string;
  storyCore?: string;
  seasonArc?: unknown;
  prevEpisode?: { order: number; title: string; summary: string; outline: unknown; coreExpression: unknown | null };
  nextEpisode?: { order: number; title: string; summary: string; outline: unknown; coreExpression: unknown | null };
  episode: { order: number; title: string; summary: string; outline: unknown };
}): string {
  return `你是专业编剧/分镜总监。请基于“全局设定 + 本集概要”，生成该集的「核心表达 Core Expression」。

必须严格输出 **一个 JSON 对象**，不要输出任何 Markdown、代码块、解释文字或多余字符。

全局设定：
- 故事梗概：
${args.storySynopsis}

- 季级硬约束（优先，用于跨集一致性；若为 '-' 代表缺失）：
  - 叙事因果链：
    ${args.narrativeCausalChain ?? '-'}
  - 故事核心（可选）：${clipText(args.storyCore, 600)}
  - 主角核心（可选）：${clipText(args.protagonistCore, 600)}
  - Season Arc 主线弧线（预留，可选）：${formatOptionalSeasonArc(args.seasonArc, 1200)}

- 画风（完整提示词）：
${args.artStyle}

- 世界观要素：
${args.worldView}

- 角色库：
${args.characters}

相邻集衔接（用于避免“单集孤岛”，只做连贯性约束，不要喧宾夺主）：
- 上一集（若有）：
  - 集数：${args.prevEpisode ? `第 ${args.prevEpisode.order} 集` : '-'}
  - 标题：${args.prevEpisode ? args.prevEpisode.title || '-' : '-'}
  - 一句话概要：${args.prevEpisode ? clipText(args.prevEpisode.summary, 220) : '-'}
  - Outline（按字符截断）：${args.prevEpisode ? clipJson(args.prevEpisode.outline, 1800) : '-'}
  - Core Expression（若已生成，按字符截断）：${args.prevEpisode ? clipJson(args.prevEpisode.coreExpression, 1800) : '-'}
- 下一集（若有）：
  - 集数：${args.nextEpisode ? `第 ${args.nextEpisode.order} 集` : '-'}
  - 标题：${args.nextEpisode ? args.nextEpisode.title || '-' : '-'}
  - 一句话概要：${args.nextEpisode ? clipText(args.nextEpisode.summary, 220) : '-'}
  - Outline（按字符截断）：${args.nextEpisode ? clipJson(args.nextEpisode.outline, 1800) : '-'}
  - Core Expression（若已生成，按字符截断）：${args.nextEpisode ? clipJson(args.nextEpisode.coreExpression, 1800) : '-'}

本集信息：
- 集数：第 ${args.episode.order} 集
- 标题：${args.episode.title || '-'}
- 一句话概要：${args.episode.summary || '-'}
- Outline（可能是结构化 JSON）：
${JSON.stringify(args.episode.outline ?? null)}

输出 JSON Schema（示意）：
{
  "theme": "一句话主题",
  "emotionalArc": ["起", "承", "转", "合"],
  "coreConflict": "核心冲突描述",
  "payoff": ["爽点/泪点/笑点/信息揭示"],
  "visualMotifs": ["母题1", "母题2"],
  "endingBeat": "结尾落点",
  "nextHook": "下一集钩子（可空）"
}`;
}

function buildJsonFixPrompt(raw: string): string {
  return `你刚才的输出无法被解析为符合要求的 JSON。请只输出一个 JSON 对象，不要输出 Markdown/代码块/解释/多余文字。

要求：
1) 必须是 JSON 对象，且可被 JSON.parse 直接解析
2) emotionalArc 必须是长度为 4 的数组

原始输出：
<<<
${raw?.trim() ?? ''}
>>>

请只输出 JSON：`;
}

export async function generateEpisodeCoreExpression(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, episodeId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: { id: true, order: true, title: true, summary: true, outline: true },
  });
  if (!episode) throw new Error('Episode not found');

  // 相邻集信息：用于减少“核心表达孤岛”，不要求相邻集已生成 coreExpression
  const [prevEpisode, nextEpisode] = await Promise.all([
    prisma.episode.findFirst({
      where: { projectId, order: episode.order - 1 },
      select: { order: true, title: true, summary: true, outline: true, coreExpression: true },
    }),
    prisma.episode.findFirst({
      where: { projectId, order: episode.order + 1 },
      select: { order: true, title: true, summary: true, outline: true, coreExpression: true },
    }),
  ]);

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

  const contextCache = project.contextCache && typeof project.contextCache === 'object'
    ? (project.contextCache as Record<string, unknown>)
    : null;

  const prompt = buildEpisodeCoreExpressionPrompt({
    storySynopsis: project.summary,
    artStyle: styleFullPrompt(project),
    worldView: formatWorldView(worldViewElements),
    characters: formatCharacters(characters),
    narrativeCausalChain: formatNarrativeCausalChain(project.contextCache),
    storyCore: typeof contextCache?.storyCore === 'string' ? contextCache.storyCore : undefined,
    protagonistCore: typeof contextCache?.protagonistCore === 'string' ? contextCache.protagonistCore : undefined,
    seasonArc:
      contextCache?.seasonArc ?? contextCache?.seasonArcText ?? contextCache?.seasonArcMain ?? contextCache?.seasonArcOutline,
    prevEpisode: prevEpisode
      ? {
          order: prevEpisode.order,
          title: prevEpisode.title,
          summary: prevEpisode.summary,
          outline: prevEpisode.outline,
          coreExpression: prevEpisode.coreExpression ?? null,
        }
      : undefined,
    nextEpisode: nextEpisode
      ? {
          order: nextEpisode.order,
          title: nextEpisode.title,
          summary: nextEpisode.summary,
          outline: nextEpisode.outline,
          coreExpression: nextEpisode.coreExpression ?? null,
        }
      : undefined,
    episode: { order: episode.order, title: episode.title, summary: episode.summary, outline: episode.outline },
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;
  providerConfig.responseFormat = jsonSchemaFormat('episode_core_expression', schemaCoreExpression());

  await updateProgress({ pct: 25, message: '调用 AI 生成核心表达...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);
  let tokenUsage = res.tokenUsage;

  await updateProgress({ pct: 55, message: '解析输出...' });

  let parsed: CoreExpression | null = null;
  let extractedJson: string | null = null;
  let fixed = false;
  try {
    ({ parsed, extractedJson } = parseCoreExpression(res.content));
  } catch (err) {
    const fixConfig = stableJsonFixConfig(providerConfig);
    let lastErr: unknown = err;
    let ok = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await updateProgress({ pct: 60 + attempt, message: `尝试修复 JSON 输出（第${attempt}/3次）...` });
      const fixMessages: ChatMessage[] = [{ role: 'user', content: buildJsonFixPrompt(res.content) }];
      const fixedRes = await chatWithProvider(fixConfig, fixMessages);
      tokenUsage = mergeTokenUsage(tokenUsage, fixedRes.tokenUsage);
      try {
        ({ parsed, extractedJson } = parseCoreExpression(fixedRes.content));
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
    throw new Error('核心表达解析失败：结果为空');
  }

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      coreExpression: parsed,
      workflowState: 'CORE_EXPRESSION_READY',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeId,
    parsed,
    raw: res.content,
    extractedJson,
    fixed,
    tokenUsage: tokenUsage ?? null,
  };
}
