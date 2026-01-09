import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { EpisodePlanSchema, type EpisodePlan } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

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
  const minMax = count ? { minItems: count, maxItems: count } : { minItems: 1, maxItems: 24 };

  return {
    type: 'object',
    additionalProperties: false,
    required: ['episodeCount', 'episodes'],
    properties: {
      episodeCount: { type: 'integer', minimum: 1, maximum: 24, ...maybeConst },
      reasoningBrief: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      episodes: {
        type: 'array',
        ...minMax,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['order', 'title', 'logline', 'mainCharacters', 'beats', 'sceneScope', 'cliffhanger'],
          properties: {
            order: { type: 'integer', minimum: 1, maximum: 24 },
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

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.plan_episodes.system',
  });

  const userPrompt = buildUserPrompt({
    storySynopsis: project.summary,
    artStyle: styleFullPrompt(project),
    worldView: formatWorldView(worldViewElements),
    characters: formatCharacters(characters),
    narrativeCausalChain: formatNarrativeCausalChain(project.contextCache),
    targetEpisodeCount: args.options?.targetEpisodeCount,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const baseConfig = toProviderChatConfig(profile);
  baseConfig.apiKey = apiKey;

  // Episode Plan 输出可能很长：为避免被 maxTokens 截断导致 JSON 未闭合，设置“不会低于模型默认值”的最低输出上限。
  const targetCount = args.options?.targetEpisodeCount ?? 12;
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

  // 强制结构化输出：用 JSON Schema 约束模型返回的 JSON（减少语法错误/字段漂移）
  providerConfig = {
    ...providerConfig,
    responseFormat: jsonSchemaFormat('episode_plan', schemaEpisodePlan(args.options?.targetEpisodeCount)),
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
    raw: res.content,
    extractedJson,
    fixed,
    tokenUsage: tokenUsage ?? null,
  };
}
