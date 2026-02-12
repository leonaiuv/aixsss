import type { PrismaClient, Prisma } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput, responseFormatForFixableOutputType } from './formatFix.js';
import {
  mergeTokenUsage,
  styleFullPrompt,
  toProviderChatConfig,
  toProviderKeyframeChatConfig,
} from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import {
  generateActionPlanJson,
  generateKeyframeGroupsJson,
  keyframeGroupsToStoryboardPromptV2,
} from './actionBeats.js';
import {
  buildCharacterVisualContext,
  buildCoreExpressionContext,
  buildNarrativeContext,
  calculateEmotionalPosition,
  parseCoreExpression,
  type CharacterVisualData,
} from './contextHelpers.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { buildMultimodalUserContent, buildVisualReferenceBundle } from './referenceBundle.js';

function inferMoodFromSummary(summary: string): string {
  const text = (summary || '').trim();
  if (!text) return '紧张';
  if (/(浪漫|爱情|温柔|甜蜜|相拥|告白)/.test(text)) return '浪漫';
  if (/(悬疑|诡异|秘密|真相|追踪|潜伏)/.test(text)) return '悬疑';
  if (/(追逐|战斗|爆炸|冲突|打斗|对决)/.test(text)) return '动作';
  if (/(科幻|太空|未来|机甲|赛博|星际)/.test(text)) return '科幻';
  return '紧张';
}

function buildFallbackUserPrompt(args: {
  style: string;
  currentSummary: string;
  sceneAnchor: string;
  panelHints: string;
  mood: string;
  castCharactersVisual: string;
  coreExpressionContext?: string;
  emotionalPosition?: '起' | '承' | '转' | '合';
  referenceSummary?: string;
}): string {
  let narrativeSection = '';
  if (args.coreExpressionContext || args.emotionalPosition) {
    const parts: string[] = ['## 叙事导演意图'];
    if (args.emotionalPosition) {
      parts.push(`当前分镜在故事中的位置: ${args.emotionalPosition}（起承转合）`);
    }
    if (args.coreExpressionContext) {
      parts.push('');
      parts.push(args.coreExpressionContext);
    }
    parts.push('');
    narrativeSection = parts.join('\n');
  }

  return `${narrativeSection}## 输入
当前分镜内容:
${args.currentSummary}

场景锚点 JSON:
${args.sceneAnchor}

视觉风格参考:
${args.style}

情绪基调:
${args.mood}

人物参考与特征（文本锚点）:
${args.castCharactersVisual}

参考图摘要:
${args.referenceSummary || '-'}

${args.panelHints}`;
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
    select: { id: true, style: true, artStyleConfig: true, protagonist: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      summary: true,
      sceneDescription: true,
      contextSummary: true,
      castCharacterIds: true,
      episodeId: true,
      order: true,
    },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.sceneDescription?.trim()) throw new Error('Scene anchor missing');

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

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      imageApiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备动作拆解与关键帧生成...' });

  // 查询完整角色信息（包括视觉描述）
  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true, appearance: true, personality: true, avatar: true, appearances: true },
  });
  const characterNameById = new Map(characterRows.map((c) => [c.id, c.name]));
  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    characterNameById,
  });

  // 获取出场角色的完整信息
  const castCharacterIds = scene.castCharacterIds ?? [];
  const castCharacters = castCharacterIds
    .map((id) => {
      const char = characterRows.find((c) => c.id === id);
      if (!char) return null;
      return {
        id: char.id,
        name: char.name,
        visualDescription: char.appearance || undefined,
        personality: char.personality || undefined,
        avatar: char.avatar || undefined,
        appearances: char.appearances ?? undefined,
      } as CharacterVisualData;
    })
    .filter((c): c is CharacterVisualData => c !== null);

  const style = styleFullPrompt(project);
  const styleMeta = [style, panelHints].filter(Boolean).join('\n\n');

  const cast = (scene.castCharacterIds ?? [])
    .map((id) => ({ id, name: characterNameById.get(id) || id }))
    .filter((c) => c.id);

  const prevScene =
    scene.order > 0
      ? await prisma.scene.findFirst({
          where: { projectId, episodeId: scene.episodeId, order: scene.order - 1 },
          select: { summary: true },
        })
      : null;

  // 构建核心表达上下文
  const coreExpression = parseCoreExpression(episode?.coreExpression);
  const emotionalPosition = calculateEmotionalPosition(scene.order, totalScenes);
  const coreExpressionContext = buildCoreExpressionContext(coreExpression, emotionalPosition);

  // 构建角色视觉上下文
  const castCharactersVisual = buildCharacterVisualContext(castCharacters);

  const narrativeContext = buildNarrativeContext(project.contextCache, scene.order, totalScenes);
  const mood = narrativeContext.emotionalTone || inferMoodFromSummary(scene.summary || '');
  const referenceBundle = buildVisualReferenceBundle({
    contextSummary: scene.contextSummary,
    castCharacters: castCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      appearances: c.appearances,
    })),
  });

  const prompt = buildFallbackUserPrompt({
    style,
    currentSummary: scene.summary || '-',
    sceneAnchor: scene.sceneDescription,
    panelHints,
    mood,
    castCharactersVisual,
    referenceSummary: `sceneRefs=${referenceBundle.sceneRefs.length}, characterRefs=${referenceBundle.characterRefs.length}`,
    coreExpressionContext: coreExpressionContext || undefined,
    emotionalPosition,
  });

  const textApiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const imageApiKey = profile.imageApiKeyEncrypted
    ? decryptApiKey(profile.imageApiKeyEncrypted, apiKeySecret)
    : '';
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = textApiKey;
  const keyframeRoute = toProviderKeyframeChatConfig(profile);
  if (keyframeRoute.useImageApiKey) {
    if (!imageApiKey.trim()) {
      throw new Error('图片 API Key 未配置：关键帧多模态生成需要图片 API Key。');
    }
    keyframeRoute.providerConfig.apiKey = imageApiKey.trim();
  } else {
    keyframeRoute.providerConfig.apiKey = textApiKey;
  }

  let tokenUsage: ReturnType<typeof mergeTokenUsage> = undefined;

  try {
    await updateProgress({ pct: 20, message: '调用 AI 生成动作拆解（ActionPlan）...' });
    const actionPlanRes = await generateActionPlanJson({
      prisma,
      teamId,
      providerConfig,
      sceneId,
      sceneSummary: scene.summary || '-',
      prevSceneSummary: prevScene?.summary || undefined,
      cast,
      sceneAnchorJson: scene.sceneDescription,
      styleFullPrompt: styleMeta,
    });
    tokenUsage = mergeTokenUsage(tokenUsage, actionPlanRes.tokenUsage);

    await updateProgress({
      pct: 55,
      message: '调用 AI 按 beat 生成三段式关键帧（KeyframeGroups）...',
    });
    const keyframeGroupsRes = await generateKeyframeGroupsJson({
      prisma,
      teamId,
      providerConfig,
      sceneId,
      sceneAnchorJson: scene.sceneDescription,
      styleFullPrompt: styleMeta,
      cast,
      beats: actionPlanRes.plan.beats,
    });
    tokenUsage = mergeTokenUsage(tokenUsage, keyframeGroupsRes.tokenUsage);

    const legacyShotPrompt = keyframeGroupsToStoryboardPromptV2(
      keyframeGroupsRes.keyframeGroups.groups,
    );

    await updateProgress({ pct: 85, message: '写入数据库...' });
    await prisma.scene.update({
      where: { id: sceneId },
      data: {
        shotPrompt: legacyShotPrompt,
        actionPlanJson: actionPlanRes.plan as unknown as Prisma.InputJsonValue,
        keyframeGroupsJson: keyframeGroupsRes.keyframeGroups as unknown as Prisma.InputJsonValue,
        status: 'keyframe_confirmed',
      },
    });

    await updateProgress({ pct: 100, message: '完成' });

    return {
      sceneId,
      shotPrompt: legacyShotPrompt,
      fixed: false,
      actionPlanJson: actionPlanRes.plan,
      keyframeGroupsJson: keyframeGroupsRes.keyframeGroups,
      tokenUsage: tokenUsage ?? null,
    };
  } catch (err) {
    await updateProgress({ pct: 25, message: '动作拆解失败，回退到直接生成 9 宫格分镜 JSON...' });

    const keyframeSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.keyframe_prompt.legacy.system',
    });
    const userContent =
      keyframeRoute.providerConfig.kind === 'nanobanana_dmxapi'
        ? buildMultimodalUserContent({ text: prompt, references: referenceBundle, maxImages: 12 })
        : prompt;
    const messages: ChatMessage[] = [
      { role: 'system', content: keyframeSystemPrompt },
      { role: 'user', content: userContent },
    ];
    const fallbackConfig = {
      ...keyframeRoute.providerConfig,
      responseFormat: responseFormatForFixableOutputType('keyframe_prompt'),
    };
    const res = await chatWithProvider(fallbackConfig, messages);

    await updateProgress({ pct: 60, message: '检查输出格式...' });

    const fixed = await fixStructuredOutput({
      prisma,
      teamId,
      providerConfig: fallbackConfig,
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

    tokenUsage = mergeTokenUsage(tokenUsage, fixed.tokenUsage);

    await updateProgress({ pct: 100, message: '完成(回退旧版)' });

    return {
      sceneId,
      shotPrompt: fixed.content,
      fixed: fixed.fixed,
      tokenUsage: tokenUsage ?? null,
      fallbackFromActionBeats: true,
      actionBeatsError: err instanceof Error ? err.message : String(err),
    };
  }
}
