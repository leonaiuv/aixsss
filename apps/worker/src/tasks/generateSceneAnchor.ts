import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import { loadSystemPrompt } from './systemPrompts.js';

function buildUserPrompt(args: {
  style: string;
  currentSummary: string;
  prevSummary: string;
  panelHints: string;
}): string {
  return [
    '## 输入',
    '视觉风格参考（可轻量融入，不要堆砌质量词）:',
    args.style || '-',
    '',
    '当前分镜概要:',
    args.currentSummary || '-',
    '',
    '上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:',
    args.prevSummary || '-',
    args.panelHints || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateSceneAnchor(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, episodeId: true, order: true, summary: true, contextSummary: true },
  });
  if (!scene) throw new Error('Scene not found');

  const prev =
    scene.order > 1
      ? await prisma.scene.findFirst({
          where: { episodeId: scene.episodeId, order: scene.order - 1 },
          select: { summary: true },
        })
      : null;

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const characterNameById = new Map(characterRows.map((c) => [c.id, c.name]));
  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    characterNameById,
    includeAssets: false,
  });

  const style = styleFullPrompt(project);
  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.scene_anchor.system',
  });
  const userPrompt = buildUserPrompt({
    style,
    currentSummary: scene.summary || '-',
    prevSummary: prev?.summary || '-',
    panelHints,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成场景锚点...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '检查输出格式...' });

  const fixed = await fixStructuredOutput({
    prisma,
    teamId,
    providerConfig,
    type: 'scene_anchor',
    raw: res.content,
    tokenUsage: res.tokenUsage,
  });

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      sceneDescription: fixed.content,
      status: 'scene_confirmed',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    sceneDescription: fixed.content,
    fixed: fixed.fixed,
    tokenUsage: fixed.tokenUsage ?? null,
  };
}

