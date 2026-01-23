import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput, responseFormatForFixableOutputType } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import { loadSystemPrompt } from './systemPrompts.js';
import {
  buildNarrativeContext,
  buildCoreExpressionContext,
  parseCoreExpression,
  type NarrativeContextData,
  type CoreExpressionData,
} from './contextHelpers.js';

function buildUserPrompt(args: {
  style: string;
  currentSummary: string;
  prevSummary: string;
  panelHints: string;
  // 新增上下文
  episodeContext?: {
    order: number;
    title: string;
    coreExpression?: CoreExpressionData | null;
  };
  narrativeContext?: NarrativeContextData;
}): string {
  const parts: string[] = ['## 输入'];

  // 叙事上下文（如果有）
  if (args.narrativeContext || args.episodeContext?.coreExpression) {
    parts.push('');
    parts.push('### 叙事导演意图');
    if (args.episodeContext) {
      parts.push(`当前剧集: 第 ${args.episodeContext.order} 集「${args.episodeContext.title}」`);
    }
    if (args.narrativeContext) {
      parts.push(`故事位置: ${args.narrativeContext.currentBeatPosition}（起承转合）`);
      if (args.narrativeContext.emotionalTone) {
        parts.push(`情绪基调: ${args.narrativeContext.emotionalTone}`);
      }
      if (args.narrativeContext.currentBeatName) {
        parts.push(`当前节拍: ${args.narrativeContext.currentBeatName}`);
      }
    }
    if (args.episodeContext?.coreExpression) {
      const coreContext = buildCoreExpressionContext(
        args.episodeContext.coreExpression,
        args.narrativeContext?.currentBeatPosition,
      );
      if (coreContext) {
        parts.push('');
        parts.push('### 核心表达');
        parts.push(coreContext);
      }
    }
    parts.push('');
    parts.push('请基于上述叙事意图来设计场景的氛围、光线和环境细节。');
  }

  parts.push('');
  parts.push('视觉风格参考（可轻量融入，不要堆砌质量词）:');
  parts.push(args.style || '-');
  parts.push('');
  parts.push('当前分镜概要:');
  parts.push(args.currentSummary || '-');
  parts.push('');
  parts.push('上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:');
  parts.push(args.prevSummary || '-');

  if (args.panelHints) {
    parts.push(args.panelHints);
  }

  return parts.filter(Boolean).join('\n');
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
    select: {
      id: true,
      style: true,
      artStyleConfig: true,
      contextCache: true, // 新增：获取叙事因果链等缓存
    },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, episodeId: true, order: true, summary: true, contextSummary: true },
  });
  if (!scene) throw new Error('Scene not found');

  // 查询 episode 信息（获取 coreExpression）
  const episode = scene.episodeId
    ? await prisma.episode.findFirst({
        where: { id: scene.episodeId },
        select: {
          order: true,
          title: true,
          coreExpression: true,
        },
      })
    : null;

  // 获取当前集的总分镜数（用于计算情感曲线位置）
  const totalScenes = scene.episodeId
    ? await prisma.scene.count({ where: { episodeId: scene.episodeId } })
    : 1;

  const prev =
    scene.order > 1
      ? await prisma.scene.findFirst({
          where: { episodeId: scene.episodeId, order: scene.order - 1 },
          select: { summary: true },
        })
      : null;

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

  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const characterNameById = new Map(characterRows.map((c) => [c.id, c.name]));
  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    characterNameById,
    includeAssets: false,
  });

  // 构建叙事上下文
  const narrativeContext = buildNarrativeContext(project.contextCache, scene.order, totalScenes);

  // 构建 episode 上下文
  const episodeContext = episode
    ? {
        order: episode.order,
        title: episode.title,
        coreExpression: parseCoreExpression(episode.coreExpression),
      }
    : undefined;

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
    episodeContext,
    narrativeContext,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;
  providerConfig.responseFormat = responseFormatForFixableOutputType('scene_anchor');

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
