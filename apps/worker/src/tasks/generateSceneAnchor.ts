import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';

function buildPrompt(args: { style: string; currentSummary: string; prevSummary: string }): string {
  return `你是专业的提示词工程师与分镜助理。请为“当前分镜”输出可复用的「场景锚点 Scene Anchor」，用于保证多张关键帧/多家图生视频的场景一致性。

## 输入
视觉风格参考（可轻量融入，不要堆砌质量词）:
${args.style}

当前分镜概要:
${args.currentSummary}

上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:
${args.prevSummary}

## 重要约束（必须遵守）
1. 只描述“环境/空间/光线/固定锚点物”，不要出现人物、不要写角色代入、不要写动作、不要写镜头运动。
2. 用于一致性：输出里要包含 4-8 个可被稳定复现的锚点元素（具体物件/结构/光位），并在 LOCK_* 行里列出；词汇要稳定，不要同义改写。
3. 同时输出中文与英文两版，内容等价但不互相翻译腔。
4. 直接输出指定格式，不要解释。

## 输出格式（严格按行输出）
SCENE_ANCHOR_ZH: ...
SCENE_ANCHOR_EN: ...
LOCK_ZH: 1) ...; 2) ...; 3) ...; ...
LOCK_EN: 1) ...; 2) ...; 3) ...; ...
AVOID_ZH: ...（如：no people/no text/no watermark/不要新增场景元素）
AVOID_EN: ...`;
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
    select: { id: true, episodeId: true, order: true, summary: true },
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

  const style = styleFullPrompt(project);
  const prompt = buildPrompt({
    style,
    currentSummary: scene.summary || '-',
    prevSummary: prev?.summary || '-',
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成场景锚点...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '检查输出格式...' });

  const fixed = await fixStructuredOutput({
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


