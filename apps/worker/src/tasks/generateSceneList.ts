import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';

function parseSceneList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[).\s-]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function generateSceneList(args: {
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
    select: { id: true, summary: true, protagonist: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  let episode = await prisma.episode.findFirst({
    where: { projectId, order: 1 },
    select: { id: true },
  });
  if (!episode) {
    try {
      episode = await prisma.episode.create({
        data: { projectId, order: 1, title: '', summary: '', workflowState: 'IDLE' },
        select: { id: true },
      });
    } catch {
      episode = await prisma.episode.findFirst({
        where: { projectId, order: 1 },
        select: { id: true },
      });
    }
  }
  if (!episode) throw new Error('Failed to ensure default episode');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      id: true,
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.scene_list.system',
  });

  const userPrompt = [
    '故事梗概：',
    project.summary || '-',
    '',
    `画风：${styleFullPrompt(project) || '-'}`,
    `主角：${project.protagonist || '-'}`,
  ].join('\n');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成分镜列表...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 70, message: '解析与写入分镜...' });

  const summaries = parseSceneList(res.content);
  if (summaries.length < 6) {
    throw new Error('AI 返回分镜数量过少，请重试或调整梗概/画风/主角描述');
  }

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { episodeId: episode.id } }),
    prisma.scene.createMany({
      data: summaries.map((summary, idx) => ({
        projectId,
        episodeId: episode.id,
        order: idx + 1,
        summary,
        status: 'pending',
      })),
    }),
    prisma.episode.update({ where: { id: episode.id }, data: { workflowState: 'SCENE_LIST_EDITING' } }),
    prisma.project.update({
      where: { id: projectId },
      data: { workflowState: 'SCENE_LIST_EDITING', currentSceneOrder: 0 },
    }),
  ]);

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneCount: summaries.length,
    scenes: summaries.map((summary, idx) => ({ order: idx + 1, summary })),
    tokenUsage: res.tokenUsage ?? null,
  };
}

