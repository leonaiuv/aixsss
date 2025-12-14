import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { toProviderChatConfig } from './common.js';

function buildPrompt(args: { sceneAnchor: string; shotPrompt: string }): string {
  return `你是图生视频(I2V)提示词工程师。请基于「三张静止关键帧 KF0/KF1/KF2」生成“描述变化”的运动/时空提示词，用于多家视频模型。

## 输入
场景锚点（环境一致性）:
${args.sceneAnchor}

三关键帧（静止描述，包含 KF0/KF1/KF2）:
${args.shotPrompt}

## 关键规则（必须遵守）
1. 只描述“从 KF0→KF1→KF2 发生了什么变化”，不要重述静态画面细节。
2. 变化分三类：人物变化 / 镜头变化 / 环境变化；每类最多 2 个要点，避免打架。
3. 给两种输出：短版（适配多数模型）+ 分拍版（0-1s/1-2s/2-3s）。
4. 输出中英双语；直接输出指定格式，不要解释。
5. 强约束必须写明：保持同一人物身份/脸/服装/发型/背景锚点不变；禁止凭空新增物体；禁止场景跳变；禁止文字水印。

## 输出格式（严格按行输出）
MOTION_SHORT_ZH: ...
MOTION_SHORT_EN: ...
MOTION_BEATS_ZH: 0-1s ...; 1-2s ...; 2-3s ...
MOTION_BEATS_EN: 0-1s ...; 1-2s ...; 2-3s ...
CONSTRAINTS_ZH: ...
CONSTRAINTS_EN: ...`;
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
    select: { id: true, sceneDescription: true, shotPrompt: true },
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

  const prompt = buildPrompt({ sceneAnchor: scene.sceneDescription, shotPrompt: scene.shotPrompt });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成运动提示词...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '检查输出格式...' });

  const fixed = await fixStructuredOutput({
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



