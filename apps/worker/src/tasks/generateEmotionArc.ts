import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { EmotionArcSchema, type EmotionArc, type EmotionArcPoint } from '@aixsss/shared';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, styleFullPrompt, toProviderChatConfig, type TokenUsage } from './common.js';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseEmotionArc(raw: string): { parsed: EmotionArc; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: EmotionArcSchema.parse(json), extractedJson };
}

function buildUserPrompt(args: {
  projectSummary: string;
  style: string;
  narrativeCausalChain: unknown;
  episodes: Array<{ order: number; title: string; summary: string; coreExpression: unknown }>;
}): string {
  return [
    '请生成跨集情绪弧线（EmotionArcSchema JSON）。',
    '',
    `项目梗概：${args.projectSummary || '-'}`,
    `画风：${args.style || '-'}`,
    '',
    '叙事因果链(JSON)：',
    JSON.stringify(args.narrativeCausalChain ?? null),
    '',
    '剧集列表：',
    args.episodes
      .map((ep) =>
        [
          `- 第${ep.order}集 ${ep.title || ''}`.trim(),
          `  summary: ${ep.summary || '-'}`,
          `  coreExpression: ${JSON.stringify(ep.coreExpression ?? null)}`,
        ].join('\n'),
      )
      .join('\n'),
  ].join('\n');
}

export async function generateEmotionArc(args: {
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
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const episodes = await prisma.episode.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, title: true, summary: true, coreExpression: true },
  });
  if (episodes.length === 0) throw new Error('No episodes found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 5, message: '准备情绪弧线提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.emotion_arc.system',
  });
  const userPrompt = buildUserPrompt({
    projectSummary: project.summary,
    style: styleFullPrompt(project),
    narrativeCausalChain: isRecord(project.contextCache)
      ? project.contextCache.narrativeCausalChain
      : null,
    episodes: episodes.map((ep) => ({
      order: ep.order,
      title: ep.title,
      summary: ep.summary,
      coreExpression: ep.coreExpression,
    })),
  });

  await updateProgress({ pct: 30, message: '调用 AI 生成情绪弧线...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);
  const tokenUsage: TokenUsage | undefined = mergeTokenUsage(undefined, res.tokenUsage);

  const { parsed, extractedJson } = parseEmotionArc(res.content);

  await updateProgress({ pct: 80, message: '写入项目与剧集情绪弧线...' });

  const baseCache = isRecord(project.contextCache)
    ? (project.contextCache as Record<string, unknown>)
    : {};
  const nextContextCache: Record<string, unknown> = {
    ...baseCache,
    emotionArc: parsed,
    emotionArcUpdatedAt: new Date().toISOString(),
  };

  await prisma.project.update({
    where: { id: projectId },
    data: { contextCache: nextContextCache as unknown as Prisma.InputJsonValue },
  });

  for (const ep of episodes) {
    const points = parsed.points.filter((point) => point.episodeOrder === ep.order);
    await prisma.episode.update({
      where: { id: ep.id },
      data: {
        emotionArcJson: {
          points,
          generatedAt: parsed.generatedAt ?? new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    projectId,
    pointCount: parsed.points.length,
    points: parsed.points as EmotionArcPoint[],
    extractedJson,
    tokenUsage: tokenUsage ?? null,
  };
}
