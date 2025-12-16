import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { EpisodePlanSchema, type EpisodePlan } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';

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
  try {
    const json = JSON.stringify(chain, null, 2);
    return json.length > 12000 ? json.slice(0, 12000) + '\n...TRUNCATED...' : json;
  } catch {
    return String(chain);
  }
}

function buildPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  targetEpisodeCount?: number;
}): string {
  return `你是专业的剧集策划。请基于以下"全局设定"，生成可执行的 N 集规划。

【重要】输出要求：
1. 必须严格输出 **一个 JSON 对象**
2. 不要输出任何 Markdown、代码块（如 \`\`\`json）、解释文字或多余字符
3. 所有字段名必须使用英文（如 title, logline, sceneScope），不要用中文字段名
4. 直接以 { 开头，以 } 结尾

全局设定：
- 故事梗概：
${args.storySynopsis}

- 画风（完整提示词）：
${args.artStyle}

- 世界观要素：
${args.worldView}

- 角色库：
${args.characters}

- 叙事因果链（结构化叙事骨架；若提供，请尽量保持一致，避免引入与其冲突的新核心矛盾）：
${args.narrativeCausalChain ?? '-'}

约束：
- 推荐集数范围：1..24
${typeof args.targetEpisodeCount === 'number' ? `- 这次必须输出 ${args.targetEpisodeCount} 集（episodeCount 必须等于该值）` : ''}
- episodes.order 必须从 1 开始连续递增
- episodeCount 必须等于 episodes.length
- 每个 episode 必须包含 order, title, logline, mainCharacters, beats, sceneScope 字段
- mainCharacters 请尽量从"角色库"里的名字中选择；如角色库为空，请输出空数组

必须严格按照以下 JSON 结构输出（注意：字段名必须是英文）：
{
  "episodeCount": 8,
  "reasoningBrief": "一句话解释为何是8集",
  "episodes": [
    {
      "order": 1,
      "title": "第1集标题",
      "logline": "一句话概要（必填）",
      "mainCharacters": ["角色A", "角色B"],
      "beats": ["开场...", "冲突升级...", "转折...", "结尾钩子..."],
      "sceneScope": "主要场景范围/地点/时间段（必填）",
      "cliffhanger": "结尾钩子（可空）"
    }
  ]
}

请直接输出 JSON：`;
}

function buildJsonFixPrompt(raw: string): string {
  return `你刚才的输出无法被解析为符合要求的 JSON。请只输出一个 JSON 对象。

【重要】修复要求：
1. 不要输出 Markdown、代码块（如 \`\`\`json）、解释或多余文字
2. 所有字段名必须使用英文：episodeCount, reasoningBrief, episodes, order, title, logline, mainCharacters, beats, sceneScope, cliffhanger
3. 直接以 { 开头，以 } 结尾
4. episodeCount 必须等于 episodes.length
5. episodes.order 必须从 1 开始连续递增
6. 每个 episode 必须包含 order, title, logline, sceneScope 字段（都是必填的）

原始输出：
<<<
${raw?.trim() ?? ''}
>>>

请只输出修正后的 JSON：`;
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

  const prompt = buildPrompt({
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

  await updateProgress({ pct: 25, message: '调用 AI 生成剧集规划...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);
  if (!res.content?.trim()) {
    throw new Error('AI 返回空内容（content 为空）。请检查模型/供应商可用性，或稍后重试。');
  }
  let tokenUsage = res.tokenUsage;

  await updateProgress({ pct: 55, message: '解析输出...' });

  let parsed: EpisodePlan;
  let extractedJson: string;
  let fixed = false;
  let lastParseError: string | null = null;
  try {
    ({ parsed, extractedJson } = parseEpisodePlan(res.content));
  } catch (err) {
    lastParseError = err instanceof Error ? err.message : String(err);
    await updateProgress({ pct: 60, message: `尝试修复 JSON 输出...（${lastParseError}）` });

    const fixMessages: ChatMessage[] = [{ role: 'user', content: buildJsonFixPrompt(res.content) }];
    const fixedRes = await chatWithProvider(providerConfig, fixMessages);
    if (!fixedRes.content?.trim()) {
      throw new Error(
        `AI 修复阶段返回空内容（content 为空）。上一次解析错误：${lastParseError ?? 'unknown'}`,
      );
    }
    tokenUsage = mergeTokenUsage(tokenUsage, fixedRes.tokenUsage);
    ({ parsed, extractedJson } = parseEpisodePlan(fixedRes.content));
    fixed = true;
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
