import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { EpisodeScriptSchema, type EpisodeScript } from '@aixsss/shared';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, styleFullPrompt, toProviderChatConfig, type TokenUsage } from './common.js';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

function parseEpisodeScript(raw: string): { parsed: EpisodeScript; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: EpisodeScriptSchema.parse(json), extractedJson };
}

function buildUserPrompt(args: {
  projectSummary: string;
  style: string;
  episode: {
    order: number;
    title: string;
    summary: string;
    outline: unknown;
    coreExpression: unknown;
  };
  existingScenes: Array<{ order: number; summary: string }>;
}): string {
  return [
    `目标：为第 ${args.episode.order} 集生成可编辑的分场脚本`,
    '',
    '全局设定：',
    `- 故事梗概：${args.projectSummary || '-'}`,
    `- 画风提示：${args.style || '-'}`,
    '',
    '本集信息：',
    `- 标题：${args.episode.title || '-'}`,
    `- 一句话概要：${args.episode.summary || '-'}`,
    '- Outline(JSON)：',
    JSON.stringify(args.episode.outline ?? null),
    '- CoreExpression(JSON)：',
    JSON.stringify(args.episode.coreExpression ?? null),
    '',
    '当前已有分镜（可参考，不要求逐字复制）：',
    args.existingScenes.length > 0
      ? args.existingScenes.map((s) => `${s.order}. ${s.summary}`).join('\n')
      : '-',
    '',
    '请输出 EpisodeScriptSchema 对应的 JSON。',
  ].join('\n');
}

function buildFixPrompt(raw: string): string {
  return ['原始输出：', '<<<', raw?.trim() ?? '', '>>>'].join('\n');
}

export async function generateSceneScript(args: {
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
    select: { id: true, summary: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: {
      id: true,
      order: true,
      title: true,
      summary: true,
      outline: true,
      coreExpression: true,
    },
  });
  if (!episode) throw new Error('Episode not found');

  const existingScenes = await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { order: 'asc' },
    select: { order: true, summary: true },
  });

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 5, message: '准备分场脚本提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.scene_script.system',
  });
  const userPrompt = buildUserPrompt({
    projectSummary: project.summary,
    style: styleFullPrompt(project),
    episode: {
      order: episode.order,
      title: episode.title,
      summary: episode.summary,
      outline: episode.outline,
      coreExpression: episode.coreExpression,
    },
    existingScenes,
  });

  await updateProgress({ pct: 30, message: '调用 AI 生成分场脚本...' });

  let tokenUsage: TokenUsage | undefined;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const first = await chatWithProvider(providerConfig, messages);
  tokenUsage = mergeTokenUsage(tokenUsage, first.tokenUsage);

  let parsed: EpisodeScript;
  let extractedJson = '';
  try {
    const r = parseEpisodeScript(first.content);
    parsed = r.parsed;
    extractedJson = r.extractedJson;
  } catch {
    await updateProgress({ pct: 60, message: '输出格式纠偏中...' });
    const fixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.scene_script.fix.system',
    });
    const fixed = await chatWithProvider(providerConfig, [
      { role: 'system', content: fixSystemPrompt },
      { role: 'user', content: buildFixPrompt(first.content) },
    ]);
    tokenUsage = mergeTokenUsage(tokenUsage, fixed.tokenUsage);
    const r = parseEpisodeScript(fixed.content);
    parsed = r.parsed;
    extractedJson = r.extractedJson;
  }

  await updateProgress({ pct: 85, message: '写入分场脚本...' });

  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      sceneScriptDraft: parsed.draft ?? '',
      workflowState: 'SCRIPT_WRITING',
    },
  });

  if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
    for (const sceneScript of parsed.scenes) {
      await prisma.scene.updateMany({
        where: { episodeId, order: sceneScript.order },
        data: {
          sceneScriptJson: sceneScript as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeId,
    sceneCount: parsed.scenes.length,
    sceneScript: parsed,
    extractedJson,
    tokenUsage: tokenUsage ?? null,
  };
}
