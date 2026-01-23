import type { PrismaClient, Prisma } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput, responseFormatForFixableOutputType } from './formatFix.js';
import { mergeTokenUsage, styleFullPrompt, toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import {
  generateActionPlanJson,
  generateKeyframeGroupsJson,
  keyframeGroupsToLegacyShotPrompt,
} from './actionBeats.js';
import {
  buildCharacterVisualContext,
  buildCoreExpressionContext,
  calculateEmotionalPosition,
  parseCoreExpression,
  type CharacterVisualData,
} from './contextHelpers.js';

function buildPrompt(args: {
  style: string;
  currentSummary: string;
  sceneAnchor: string;
  characters: string;
  panelHints: string;
  // 新增上下文
  castCharactersVisual?: string;
  coreExpressionContext?: string;
  emotionalPosition?: '起' | '承' | '转' | '合';
}): string {
  // 构建叙事上下文部分
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
    parts.push('请基于上述叙事意图来设计角色的表情、姿态和画面氛围。');
    parts.push('');
    narrativeSection = parts.join('\n');
  }

  // 角色视觉描述部分
  const characterSection = args.castCharactersVisual
    ? `出场角色（包含视觉特征参考，但仅用于理解角色，关键帧中只需点名，外观由定妆照资产保证）:\n${args.castCharactersVisual}`
    : `出场角色（仅用于点名，不要写长外观描述，角色外观由定妆照资产保证）:\n${args.characters}`;

  return `你是专业的绘图/视频关键帧提示词工程师。用户已经用"场景锚点"生成了一张无人物的场景图（背景参考图），角色定妆照也已预先生成。现在请为 img2img/图生图 输出 9 张「静止」关键帧的"主体差分提示词"JSON：KF0-KF8（按顺序）。

${narrativeSection}## 输入
当前分镜概要（决定九帧的动作分解）:
${args.currentSummary}

场景锚点 JSON（环境一致性）:
${args.sceneAnchor}

视觉风格参考:
${args.style}

${characterSection}
${args.panelHints}

## 关键规则（必须遵守）
1. 只描述主体（人物/物品）在场景中的【位置、姿势、动作定格、交互关系】，不要描述人物外貌细节（发型/脸/服装款式等由定妆照资产保证）。
2. 9 帧必须连贯：相邻两帧之间人物位置/朝向/道具状态要有合理衔接，禁止无理由跳变。
3. 默认同一场景/光照/透视，背景参考图不变：不要改背景、不要新增场景物件。
4. 每个关键帧都是"定格瞬间"，禁止写连续过程词：then/after/starts to/slowly/gradually/随后/然后/开始/逐渐。
5. 禁止 walking/running/moving 等连续动作表达；允许用静态姿态词：standing/sitting/leaning/holding/hand raised/frozen moment/static pose。
6. 场景定位只允许引用场景锚点 anchors 中的 2-4 个锚点名，不要重新描述环境细节。
7. KF0-KF8 需要形成“序列感”：相邻两帧至少 2 个可见差异；每三帧一组应体现 start/mid/end 的推进。
8. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "camera": {
    "type": "特写/中景/全景/远景",
    "angle": "正面/侧面/俯视/仰视/3/4侧面",
    "aspectRatio": "画面比例（如 16:9/3:4/1:1）"
  },
  "keyframes": {
    "KF0": {
      "zh": {
        "subjects": [
          {
            "name": "角色/物品名（点名即可）",
            "position": "画面位置（如：画面左侧/中央偏右/前景）",
            "pose": "姿势状态（如：站立/坐姿/倚靠）",
            "action": "动作定格（如：右手举起/双手交叉胸前）",
            "expression": "表情（仅特写镜头需要，如：微笑/凝视）",
            "gaze": "视线方向（如：看向镜头/看向画面右侧）",
            "interaction": "与其他主体或场景的交互（如：手扶栏杆/与B角色对视）"
          }
        ],
        "usedAnchors": ["引用的场景锚点1", "锚点2"],
        "composition": "构图说明（如：三分法左侧/居中对称）",
        "bubbleSpace": "气泡留白区域（如：右上角/无需留白）"
      },
      "en": {
        "subjects": [
          {
            "name": "character/object name",
            "position": "position in frame",
            "pose": "pose state",
            "action": "frozen action",
            "expression": "expression (for close-up only)",
            "gaze": "gaze direction",
            "interaction": "interaction with others or scene"
          }
        ],
        "usedAnchors": ["anchor1", "anchor2"],
        "composition": "composition notes",
        "bubbleSpace": "bubble space area"
      }
    },
    "KF1": {
      "zh": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." },
      "en": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." }
    },
    "KF2": {
      "zh": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." },
      "en": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." }
    },
    "KF3": { "zh": {...}, "en": {...} },
    "KF4": { "zh": {...}, "en": {...} },
    "KF5": { "zh": {...}, "en": {...} },
    "KF6": { "zh": {...}, "en": {...} },
    "KF7": { "zh": {...}, "en": {...} },
    "KF8": { "zh": {...}, "en": {...} }
  },
  "avoid": {
    "zh": "避免元素（如：多余角色/背景变化/文字水印/运动模糊/解剖错误）",
    "en": "Elements to avoid (e.g., extra characters, background changes, text/watermark, motion blur, bad anatomy)"
  }
}`;
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
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备动作拆解与关键帧生成...' });

  // 查询完整角色信息（包括视觉描述）
  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true, appearance: true, personality: true },
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

  const prompt = buildPrompt({
    style,
    currentSummary: scene.summary || '-',
    sceneAnchor: scene.sceneDescription,
    characters: project.protagonist || '-',
    panelHints,
    castCharactersVisual,
    coreExpressionContext: coreExpressionContext || undefined,
    emotionalPosition,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

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

    const legacyShotPrompt = keyframeGroupsToLegacyShotPrompt(
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
    await updateProgress({ pct: 25, message: '动作拆解失败，回退到直接生成 9 帧 KF0-KF8...' });

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const fallbackConfig = {
      ...providerConfig,
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
