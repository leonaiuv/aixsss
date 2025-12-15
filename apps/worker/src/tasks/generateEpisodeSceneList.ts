import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';

function parseSceneList(text: string, limit: number): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[).\s-]+/, '').trim())
    .filter(Boolean)
    .slice(0, limit);
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
  episode: { order: number; title: string; summary: string; outline: unknown; coreExpression: unknown };
  sceneCount: number;
}): string {
  return `你是一位专业的分镜师。请基于以下信息，为“当前集”生成 ${args.sceneCount} 条分镜概要（每条 15-30 字），覆盖起承转合与视觉冲击点。

输出格式要求：
1) 纯文本输出（不要 JSON/Markdown/代码块）
2) 每行一条分镜，建议以“1.”、“2.”编号开头

全局设定：
- 故事梗概：
${args.storySynopsis}

- 画风（完整提示词）：
${args.artStyle}

- 世界观要素：
${args.worldView}

- 角色库：
${args.characters}

当前集：
- 集数：第 ${args.episode.order} 集
- 标题：${args.episode.title || '-'}
- 一句话概要：${args.episode.summary || '-'}
- Outline（可能是结构化 JSON）：
${JSON.stringify(args.episode.outline ?? null)}

- Core Expression（结构化 JSON）：
${JSON.stringify(args.episode.coreExpression ?? null)}

请开始生成：`;
}

export async function generateEpisodeSceneList(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  apiKeySecret: string;
  options?: { sceneCountHint?: number };
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, episodeId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: { id: true, order: true, title: true, summary: true, outline: true, coreExpression: true },
  });
  if (!episode) throw new Error('Episode not found');
  if (!episode.coreExpression) throw new Error('Episode coreExpression missing');

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

  const sceneCount = Math.max(8, Math.min(12, args.options?.sceneCountHint ?? 10));

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const prompt = buildPrompt({
    storySynopsis: project.summary,
    artStyle: styleFullPrompt(project),
    worldView: formatWorldView(worldViewElements),
    characters: formatCharacters(characters),
    episode: {
      order: episode.order,
      title: episode.title,
      summary: episode.summary,
      outline: episode.outline,
      coreExpression: episode.coreExpression,
    },
    sceneCount,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成分镜列表...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 70, message: '解析与写入分镜...' });

  const summaries = parseSceneList(res.content, sceneCount);
  if (summaries.length < 6) {
    throw new Error('AI 返回分镜数量过少，请重试或调整梗概/画风/核心表达');
  }

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { episodeId } }),
    prisma.scene.createMany({
      data: summaries.map((summary, idx) => ({
        projectId,
        episodeId,
        order: idx + 1,
        summary,
        status: 'pending',
      })),
    }),
    prisma.episode.update({ where: { id: episodeId }, data: { workflowState: 'SCENE_LIST_EDITING' } }),
    prisma.project.update({ where: { id: projectId }, data: { workflowState: 'EPISODE_CREATING' } }),
  ]);

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeId,
    sceneCount: summaries.length,
    scenes: summaries.map((summary, idx) => ({ order: idx + 1, summary })),
    tokenUsage: res.tokenUsage ?? null,
  };
}

