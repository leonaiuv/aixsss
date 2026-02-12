import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput, responseFormatForFixableOutputType } from './formatFix.js';
import { toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import { loadSystemPrompt } from './systemPrompts.js';
import {
  extractKF0FromShotPrompt,
  extractKF8FromShotPrompt,
  buildContinuityContext,
} from './contextHelpers.js';

function buildUserPrompt(args: {
  sceneAnchor: string;
  shotPrompt: string;
  panelHints: string;
  // 新增连续性上下文
  sceneSummary?: string;
  prevSceneEndFrame?: string;
  nextSceneStartFrame?: string;
}): string {
  const parts: string[] = [];

  // 分镜概要（帮助 AI 理解当前分镜的动作意图）
  if (args.sceneSummary) {
    parts.push('当前分镜概要:');
    parts.push(args.sceneSummary);
    parts.push('');
  }

  // 连续性上下文（如果有前后分镜）
  if (args.prevSceneEndFrame || args.nextSceneStartFrame) {
    const continuityContext = buildContinuityContext({
      prevSceneEndFrame: args.prevSceneEndFrame,
      nextSceneStartFrame: args.nextSceneStartFrame,
    });
    if (continuityContext) {
      parts.push(continuityContext);
      parts.push('');
    }
  }

  parts.push('场景锚点 JSON:');
  parts.push(args.sceneAnchor || '-');
  parts.push('');
  parts.push('9宫格分镜 JSON（静止描述，包含 shots[分镜1-分镜9]）:');
  parts.push(args.shotPrompt || '-');

  if (args.panelHints) {
    parts.push(args.panelHints);
  }

  return parts.filter(Boolean).join('\n');
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
    select: {
      id: true,
      sceneDescription: true,
      shotPrompt: true,
      contextSummary: true,
      summary: true, // 新增：分镜概要
      episodeId: true, // 新增：用于查询前后分镜
      order: true, // 新增：用于查询前后分镜
    },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.sceneDescription?.trim()) throw new Error('Scene anchor missing');
  if (!scene.shotPrompt?.trim()) throw new Error('Keyframe prompt missing');

  // 查询上一分镜的结束状态 (KF8)
  const prevScene =
    scene.order > 1
      ? await prisma.scene.findFirst({
          where: { episodeId: scene.episodeId, order: scene.order - 1 },
          select: { shotPrompt: true },
        })
      : null;

  // 查询下一分镜的开始状态 (KF0)，如果存在
  const nextScene = await prisma.scene.findFirst({
    where: { episodeId: scene.episodeId, order: scene.order + 1 },
    select: { shotPrompt: true },
  });

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    includeAssets: false,
  });

  // 提取前后分镜的关键帧
  const prevSceneEndFrame = extractKF8FromShotPrompt(prevScene?.shotPrompt);
  const nextSceneStartFrame = extractKF0FromShotPrompt(nextScene?.shotPrompt);

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.motion_prompt.system',
  });
  const userPrompt = buildUserPrompt({
    sceneAnchor: scene.sceneDescription,
    shotPrompt: scene.shotPrompt,
    panelHints,
    sceneSummary: scene.summary || undefined,
    prevSceneEndFrame,
    nextSceneStartFrame,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;
  providerConfig.responseFormat = responseFormatForFixableOutputType('motion_prompt');

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
