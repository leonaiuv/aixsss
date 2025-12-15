import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';
import { EpisodePlanSchema, type EpisodePlan } from '@aixsss/shared';

function extractJsonObject(text: string): string | null {
  const raw = text?.trim() ?? '';
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function parseEpisodePlan(raw: string): { parsed: EpisodePlan; extractedJson: string } {
  const extracted = extractJsonObject(raw);
  if (!extracted) throw new Error('AI 输出中未找到 JSON 对象');
  const json = JSON.parse(extracted) as unknown;
  return { parsed: EpisodePlanSchema.parse(json), extractedJson: extracted };
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

function buildPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  targetEpisodeCount?: number;
}): string {
  return `你是专业的剧集策划。请基于以下“全局设定”，生成可执行的 N 集规划。

必须严格输出 **一个 JSON 对象**，不要输出任何 Markdown、代码块、解释文字或多余字符。

全局设定：
- 故事梗概：
${args.storySynopsis}

- 画风（完整提示词）：
${args.artStyle}

- 世界观要素：
${args.worldView}

- 角色库：
${args.characters}

约束：
- 推荐集数范围：1..24
${typeof args.targetEpisodeCount === 'number' ? `- 这次必须输出 ${args.targetEpisodeCount} 集（episodeCount 必须等于该值）` : ''}
- episodes.order 必须从 1 开始连续递增
- episodeCount 必须等于 episodes.length
- mainCharacters 请尽量从“角色库”里的名字中选择；如角色库为空，请输出空数组

输出 JSON Schema（示意）：
{
  "episodeCount": 8,
  "reasoningBrief": "一句话解释为何是8集",
  "episodes": [
    {
      "order": 1,
      "title": "第1集标题",
      "logline": "一句话概要",
      "mainCharacters": ["角色A", "角色B"],
      "beats": ["开场...", "冲突升级...", "转折...", "结尾钩子..."],
      "sceneScope": "主要场景范围/地点/时间段",
      "cliffhanger": "结尾钩子（可空）"
    }
  ]
}`;
}

function buildJsonFixPrompt(raw: string): string {
  return `你刚才的输出无法被解析为符合要求的 JSON。请只输出一个 JSON 对象，不要输出 Markdown/代码块/解释/多余文字。

要求：
1) 必须是 JSON 对象，且可被 JSON.parse 直接解析
2) episodeCount 必须等于 episodes.length
3) episodes.order 必须从 1 开始连续递增

原始输出：
<<<
${raw?.trim() ?? ''}
>>>

请只输出 JSON：`;
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
    select: { id: true, summary: true, style: true, artStyleConfig: true },
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
    targetEpisodeCount: args.options?.targetEpisodeCount,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成剧集规划...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 55, message: '解析输出...' });

  let parsed: EpisodePlan;
  let extractedJson: string;
  let fixed = false;
  try {
    ({ parsed, extractedJson } = parseEpisodePlan(res.content));
  } catch {
    await updateProgress({ pct: 60, message: '尝试修复 JSON 输出...' });
    const fixMessages: ChatMessage[] = [{ role: 'user', content: buildJsonFixPrompt(res.content) }];
    const fixedRes = await chatWithProvider(providerConfig, fixMessages);
    ({ parsed, extractedJson } = parseEpisodePlan(fixedRes.content));
    fixed = true;
  }

  await updateProgress({ pct: 80, message: '写入数据库...' });

  const episodeCount = parsed.episodeCount;
  const planByOrder = new Map(parsed.episodes.map((e) => [e.order, e] as const));

  await prisma.$transaction(async (tx) => {
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
    tokenUsage: res.tokenUsage ?? null,
  };
}

