import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';

function buildPrompt(args: { sceneAnchor: string; shotPrompt: string; panelHints: string }): string {
  return `你是图生视频(I2V)提示词工程师。请基于「三张静止关键帧 KF0/KF1/KF2」生成"描述变化"的运动/时空提示词JSON，用于多家视频模型。

## 输入
场景锚点 JSON:
${args.sceneAnchor}

三关键帧 JSON（静止描述，包含 KF0/KF1/KF2）:
${args.shotPrompt}
${args.panelHints}

## 关键规则（必须遵守）
1. 只描述"从 KF0→KF1→KF2 发生了什么变化"，不要重述静态画面细节。
2. 变化分三类：主体变化（人物/物品）/ 镜头变化 / 环境变化；每类最多 2 个要点，避免打架。
3. 给两种输出：短版（适配多数模型）+ 分拍版（0-1s/1-2s/2-3s 时间节拍）。
4. 强约束必须写明：保持同一人物身份/脸/服装/发型/背景锚点不变；禁止凭空新增物体；禁止场景跳变；禁止文字水印。
5. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "motion": {
    "short": {
      "zh": "简短运动描述（一句话概括整体变化，20-40字）",
      "en": "Short motion description (one sentence summarizing overall change)"
    },
    "beats": {
      "zh": {
        "0-1s": "第一秒内的变化描述",
        "1-2s": "第二秒内的变化描述",
        "2-3s": "第三秒内的变化描述"
      },
      "en": {
        "0-1s": "Changes in first second",
        "1-2s": "Changes in second second",
        "2-3s": "Changes in third second"
      }
    }
  },
  "changes": {
    "subject": {
      "zh": ["主体变化1（如：角色A从坐姿站起）", "主体变化2"],
      "en": ["Subject change 1", "Subject change 2"]
    },
    "camera": {
      "zh": ["镜头变化（如：轻微推进/保持静止）"],
      "en": ["Camera change"]
    },
    "environment": {
      "zh": ["环境变化（如：窗帘轻微飘动/光线渐暗）"],
      "en": ["Environment change"]
    }
  },
  "constraints": {
    "zh": "约束条件（如：保持人物身份一致、背景锚点不变、禁止新增物体、禁止场景跳变、禁止文字水印）",
    "en": "Constraints (e.g., maintain character identity, keep background anchors unchanged, no new objects, no scene jumps, no text/watermark)"
  }
}`;
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
  const prompt = buildPrompt({
    sceneAnchor: scene.sceneDescription,
    shotPrompt: scene.shotPrompt,
    panelHints,
  });

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


