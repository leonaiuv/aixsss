import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';

function buildPrompt(args: {
  style: string;
  currentSummary: string;
  sceneAnchor: string;
  characters: string;
  panelHints: string;
}): string {
  return `你是专业的绘图/视频关键帧提示词工程师。用户已经用“场景锚点”生成了一张无人物的场景图（背景参考图）。现在请为 img2img/图生图 输出 3 张「静止」关键帧的“人物差分提示词”：KF0(起始) / KF1(中间) / KF2(结束)，用于在同一背景上生成连贯的三帧。

## 输入
当前分镜概要（决定三帧的动作分解）:
${args.currentSummary}

场景锚点（环境一致性，包含 LOCK_*。注意：只允许引用 LOCK_* 里的锚点名用于定位，不要复述场景段落）:
${args.sceneAnchor}

视觉风格参考（可融入，但避免堆砌“masterpiece/best quality/8k”等质量词）:
${args.style}

出场角色（仅用于点名，不要写长外观描述）:
${args.characters}
${args.panelHints}

## 关键规则（必须遵守）
1) 三帧默认同一镜头/构图/透视/光照，并以同一背景参考图为底：不要改背景、不要新增场景物件。
2) 每个关键帧都是“定格瞬间”，禁止写连续过程词：then/after/starts to/slowly/gradually/随后/然后/开始/逐渐。
3) 禁止 walking/running/moving 等连续动作表达；允许用静态姿态词：standing/sitting/leaning/holding/hand raised/frozen moment/static pose。
4) 每个 KF 只写“人物差分”：位置（left/right/foreground/background 或三分法）、静态姿态/定格动作、手部/道具状态、遮挡关系、留白（气泡区域）。
5) 角色一致性由参考图资产保证：不要重复外观描述（发型/脸/服装款式/细节），只写差量（表情/姿势/交互）。
6) 场景定位只允许引用 2-4 个 LOCK_* 锚点名，不要重新描述环境细节。
7) KF0/KF1/KF2 必须明显不同：每帧至少 3 个可见差异（位置/姿态/手部/道具/视线/距离），但都必须是定格瞬间。
8) AVOID 不要写 “no people/no characters/no hands”。可写：no extra characters / keep background unchanged / no text/watermark / no motion blur / bad hands / extra fingers / bad anatomy。
9) 中英双语都要输出，并且每个 KF 的 ZH/EN 都是可直接用于图生图/参考图的完整提示词。
10) 直接输出指定格式，不要解释。

## 输出格式（严格按行输出）
KF0_ZH: ...
KF0_EN: ...
KF1_ZH: ...
KF1_EN: ...
KF2_ZH: ...
KF2_EN: ...
AVOID_ZH: ...
AVOID_EN: ...`;
}

export async function generateKeyframePrompt(args: {
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
    select: { id: true, style: true, artStyleConfig: true, protagonist: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, summary: true, sceneDescription: true, contextSummary: true },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.sceneDescription?.trim()) throw new Error('Scene anchor missing');

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
  });

  const style = styleFullPrompt(project);
  const prompt = buildPrompt({
    style,
    currentSummary: scene.summary || '-',
    sceneAnchor: scene.sceneDescription,
    characters: project.protagonist || '-',
    panelHints,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成关键帧提示词...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '检查输出格式...' });

  const fixed = await fixStructuredOutput({
    providerConfig,
    type: 'keyframe_prompt',
    raw: res.content,
    tokenUsage: res.tokenUsage,
  });

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      shotPrompt: fixed.content,
      status: 'keyframe_confirmed',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    shotPrompt: fixed.content,
    fixed: fixed.fixed,
    tokenUsage: fixed.tokenUsage ?? null,
  };
}


