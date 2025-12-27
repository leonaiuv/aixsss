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
  prevSummary: string;
  panelHints: string;
}): string {
  return `你是专业的提示词工程师与分镜助理。请为"当前分镜"输出可复用的「场景锚点 Scene Anchor」JSON，用于保证多张关键帧/多家图生视频的场景一致性。

## 输入
视觉风格参考（可轻量融入，不要堆砌质量词）:
${args.style}

当前分镜概要:
${args.currentSummary}

上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:
${args.prevSummary}
${args.panelHints}

## 重要约束（必须遵守）
1. 只描述"环境/空间/光线/固定锚点物"，绝对不要出现人物、不要写角色代入、不要写动作、不要写镜头运动。
2. anchors 数组里要包含 4-8 个可被稳定复现的锚点元素（具体物件/结构/光位）；词汇要稳定，不要同义改写。
3. 同时输出中文与英文两版，内容等价但不互相翻译腔。
4. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "scene": {
    "zh": "场景整体描述（一段话，60-120字）",
    "en": "Overall scene description (one paragraph)"
  },
  "location": {
    "type": "室内/室外/虚拟空间",
    "name": "具体地点名称",
    "details": "空间结构与布局细节"
  },
  "lighting": {
    "type": "自然光/人工光/混合光",
    "direction": "光源方向（如：左上45°/正面柔光/背光剪影）",
    "color": "光线色温或颜色（如：暖黄色/冷白色/金色夕阳）",
    "intensity": "光照强度描述（如：柔和/强烈/昏暗）"
  },
  "atmosphere": {
    "mood": "氛围情绪基调",
    "weather": "天气状况（室内可写'不适用'）",
    "timeOfDay": "时间段（如：黄昏/深夜/正午）"
  },
  "anchors": {
    "zh": ["锚点物1", "锚点物2", "锚点物3", "...（4-8个）"],
    "en": ["anchor1", "anchor2", "anchor3", "..."]
  },
  "avoid": {
    "zh": "不要出现的元素（如：人物、文字、水印、多余物体）",
    "en": "Elements to avoid (e.g., people, text, watermark, extra objects)"
  }
}`;
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
  const prompt = buildPrompt({
    style,
    currentSummary: scene.summary || '-',
    prevSummary: prev?.summary || '-',
    panelHints,
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

