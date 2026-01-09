import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import { loadSystemPrompt } from './systemPrompts.js';

function buildUserPrompt(args: { sceneAnchor: string; shotPrompt: string; panelHints: string }): string {
  return [
    '场景锚点 JSON:',
    args.sceneAnchor || '-',
    '',
    '三关键帧 JSON（静止描述，包含 KF0/KF1/KF2）:',
    args.shotPrompt || '-',
    args.panelHints || '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function generateMotionPrompt(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, sceneDescription: true, shotPrompt: true, contextSummary: true },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.sceneDescription?.trim()) throw new Error('Scene anchor missing');
  if (!scene.shotPrompt?.trim()) throw new Error('Keyframe prompt missing');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    includeAssets: false,
  });
  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.motion_prompt.system',
  });
  const userPrompt = buildUserPrompt({
    sceneAnchor: scene.sceneDescription,
    shotPrompt: scene.shotPrompt,
    panelHints,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成运动提示词...' });

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
    type: 'motion_prompt',
    raw: res.content,
    tokenUsage: res.tokenUsage,
  });

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      motionPrompt: fixed.content,
      // 注意：现有前端以 motion_generating 表示“运动提示词已生成，等待台词/收尾”
      status: 'motion_generating',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    motionPrompt: fixed.content,
    fixed: fixed.fixed,
    tokenUsage: fixed.tokenUsage ?? null,
  };
}


