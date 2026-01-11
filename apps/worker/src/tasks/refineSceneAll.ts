import type { Prisma, PrismaClient } from '@prisma/client';
import { UnrecoverableError, type JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig, type TokenUsage, mergeTokenUsage } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript, type PanelScriptV1 } from './panelScriptHints.js';
import { generateActionPlanJson, generateKeyframeGroupsJson, keyframeGroupsToLegacyShotPrompt } from './actionBeats.js';
import { loadSystemPrompt } from './systemPrompts.js';

function isPrismaNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2025';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type SceneRefinementSkipSteps = {
  sceneDescription?: boolean;
  shotPrompt?: boolean;
};

type SceneRefinementManualOverrides = {
  sceneDescription?: string;
  shotPrompt?: string;
};

function getRefinementSettings(contextSummary: unknown): {
  skipSteps: SceneRefinementSkipSteps;
  manualOverrides: SceneRefinementManualOverrides;
} {
  if (!isRecord(contextSummary)) {
    return { skipSteps: {}, manualOverrides: {} };
  }
  const refinement = isRecord(contextSummary.refinement) ? contextSummary.refinement : {};
  const skipSteps = isRecord(refinement.skipSteps) ? refinement.skipSteps : {};
  const manualOverrides = isRecord(refinement.manualOverrides) ? refinement.manualOverrides : {};
  return {
    skipSteps: {
      sceneDescription: skipSteps.sceneDescription === true,
      shotPrompt: skipSteps.shotPrompt === true,
    },
    manualOverrides: {
      sceneDescription: typeof manualOverrides.sceneDescription === 'string' ? manualOverrides.sceneDescription : undefined,
      shotPrompt: typeof manualOverrides.shotPrompt === 'string' ? manualOverrides.shotPrompt : undefined,
    },
  };
}

async function safeUpdateScene(args: {
  prisma: PrismaClient;
  projectId: string;
  sceneId: string;
  data: Prisma.SceneUpdateManyMutationInput;
}) {
  const result = await args.prisma.scene.updateMany({
    where: { id: args.sceneId, projectId: args.projectId },
    data: args.data,
  });
  if (result.count === 0) {
    throw new UnrecoverableError('Scene not found');
  }
}

function countChineseLikeChars(text: string): number {
  // 粗略：去掉空白后按字符计数（含中英文/标点），用于“气泡承载”估算
  return text.replace(/\s+/gu, '').length;
}

function computeDialogueMetrics(dialogues: Array<{ content?: unknown }>): {
  dialogueLineCount: number;
  dialogueCharCount: number;
  estimatedSeconds: number;
} {
  const lines = dialogues
    .map((d) => (typeof d.content === 'string' ? d.content.trim() : ''))
    .filter((c) => c.length > 0);
  const dialogueLineCount = lines.length;
  const dialogueCharCount = lines.reduce((sum, line) => sum + countChineseLikeChars(line), 0);

  const base = 2.5;
  const reading = dialogueCharCount > 0 ? dialogueCharCount / 6 : 0;
  const bubbleBuffer = dialogueLineCount * 0.5;
  const estimatedSeconds = Math.max(base, Math.min(15, reading + bubbleBuffer));

  return {
    dialogueLineCount,
    dialogueCharCount,
    estimatedSeconds: Number(estimatedSeconds.toFixed(1)),
  };
}

function buildSceneAnchorUserPrompt(args: {
  style: string;
  currentSummary: string;
  prevSummary: string;
  panelHints: string;
}): string {
  return [
    '## 输入',
    '视觉风格参考（可轻量融入，不要堆砌质量词）:',
    args.style || '-',
    '',
    '当前分镜概要:',
    args.currentSummary || '-',
    '',
    '上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:',
    args.prevSummary || '-',
    args.panelHints || '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildKeyframePrompt(args: {
  style: string;
  currentSummary: string;
  sceneAnchor: string;
  characters: string;
  panelHints: string;
}): string {
  return `你是专业的绘图/视频关键帧提示词工程师。用户已经用"场景锚点"生成了背景参考图，角色定妆照也已预先生成。现在请输出 9 张「静止」关键帧的"主体差分提示词"JSON：KF0-KF8。

## 关键规则（必须遵守）
1. 只描述主体（人物/物品）在场景中的【位置、姿势、动作定格、交互关系】，不要描述人物外貌细节。
2. 9 帧必须连贯：相邻两帧之间人物位置/朝向/道具状态要有合理衔接，禁止无理由跳变。
3. 默认同一场景/光照/透视，背景参考图不变：不要改背景、不要新增场景物件。
4. 每个关键帧都是"定格瞬间"，禁止写连续过程词。
5. 场景定位只允许引用场景锚点 anchors 中的 2-4 个锚点名。
6. KF0-KF8 需要形成“序列感”：相邻两帧至少 2 个可见差异；每三帧一组应体现 start/mid/end 的推进。
7. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输入
当前分镜概要:
${args.currentSummary}

场景锚点 JSON:
${args.sceneAnchor}

视觉风格参考:
${args.style}

出场角色（仅用于点名，外观由定妆照资产保证）:
${args.characters}
${args.panelHints}

## 输出格式（严格 JSON）
{
  "camera": {
    "type": "特写/中景/全景/远景",
    "angle": "正面/侧面/俯视/仰视",
    "aspectRatio": "画面比例"
  },
  "keyframes": {
    "KF0": {
      "zh": {
        "subjects": [{ "name": "角色名", "position": "位置", "pose": "姿势", "action": "动作", "expression": "表情", "gaze": "视线", "interaction": "交互" }],
        "usedAnchors": ["锚点1", "锚点2"],
        "composition": "构图说明",
        "bubbleSpace": "气泡留白"
      },
      "en": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." }
    },
    "KF1": { "zh": {...}, "en": {...} },
    "KF2": { "zh": {...}, "en": {...} },
    "KF3": { "zh": {...}, "en": {...} },
    "KF4": { "zh": {...}, "en": {...} },
    "KF5": { "zh": {...}, "en": {...} },
    "KF6": { "zh": {...}, "en": {...} },
    "KF7": { "zh": {...}, "en": {...} },
    "KF8": { "zh": {...}, "en": {...} }
  },
  "avoid": {
    "zh": "避免元素",
    "en": "Elements to avoid"
  }
}`;
}

function buildMotionUserPrompt(args: { sceneAnchor: string; shotPrompt: string; panelHints: string }): string {
  return [
    '场景锚点 JSON:',
    args.sceneAnchor || '-',
    '',
    '9关键帧 JSON:',
    args.shotPrompt || '-',
    args.panelHints || '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDialogueUserPrompt(args: {
  sceneSummary: string;
  sceneAnchor: string;
  shotPrompt: string;
  motionPrompt: string;
  characters: string;
  panelHints: string;
}): string {
  return [
    '分镜概要:',
    args.sceneSummary || '-',
    '',
    '场景锚点（环境一致性）:',
    args.sceneAnchor || '-',
    '',
    '9关键帧（静止）:',
    args.shotPrompt || '-',
    '',
    '运动/时空提示词:',
    args.motionPrompt || '-',
    '',
    '场景中的角色:',
    args.characters || '-',
    args.panelHints || '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDialogueFixUserPrompt(raw: string): string {
  const original = raw?.trim() ?? '';
  return ['原始内容：', '<<<', original, '>>>'].join('\n');
}

function parseDialogueLines(text: string): Array<{ id: string; type: string; content: string; order: number; characterName?: string }> {
  const raw = text?.trim();
  if (!raw) return [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed: Array<{ id: string; type: string; content: string; order: number; characterName?: string }> = [];
  let order = 0;
  for (const line of lines) {
    const match = line.match(/^\[(对白|独白|旁白|心理)(?:\|[^\]]+)?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/);
    if (!match) continue;
    order += 1;
    const typeLabel = match[1];
    const characterName = match[2]?.trim();
    const content = match[3]?.trim() ?? '';
    const type =
      typeLabel === '旁白' ? 'narration' : typeLabel === '对白' ? 'dialogue' : typeLabel === '独白' ? 'monologue' : 'thought';
    parsed.push({
      id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      type,
      content,
      order,
      ...(characterName && type !== 'narration' ? { characterName } : {}),
    });
  }
  return parsed;
}

async function doChat(config: {
  providerConfig: ReturnType<typeof toProviderChatConfig>;
  messages: ChatMessage[];
}): Promise<{ content: string; tokenUsage?: TokenUsage }> {
  return chatWithProvider(config.providerConfig, config.messages);
}

export async function refineSceneAll(args: {
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
  if (!project) throw new UnrecoverableError('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      episodeId: true,
      order: true,
      summary: true,
      sceneDescription: true,
      shotPrompt: true,
      castCharacterIds: true,
      contextSummary: true,
    },
  });
  if (!scene) throw new UnrecoverableError('Scene not found');

  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const characterNameById = new Map(characterRows.map((c) => [c.id, c.name]));
  const panelScript = getExistingPanelScript(scene.contextSummary);
  const panelHints = formatPanelScriptHints(panelScript, { characterNameById });

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

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  let tokens: TokenUsage | undefined;

  const refinementSettings = getRefinementSettings(scene.contextSummary);
  const manualSceneDescription = refinementSettings.manualOverrides.sceneDescription?.trim() ?? '';
  const manualShotPrompt = refinementSettings.manualOverrides.shotPrompt?.trim() ?? '';

  // 1) Scene anchor
  let anchorContent = scene.sceneDescription || '';
  if (refinementSettings.skipSteps.sceneDescription) {
    anchorContent = manualSceneDescription || anchorContent;
    if (!anchorContent) {
      throw new UnrecoverableError('Scene anchor skipped but no manual override provided');
    }
    await updateProgress({ pct: 5, message: '跳过场景锚点生成，使用手动输入...' });
  } else {
    await updateProgress({ pct: 5, message: '生成场景锚点...' });
    try {
      await safeUpdateScene({ prisma, projectId, sceneId, data: { status: 'scene_generating' } });
    } catch (err) {
      if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
      throw err;
    }

    const anchorSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.scene_anchor.system',
    });
    const anchorUserPrompt = buildSceneAnchorUserPrompt({
      style: styleFullPrompt(project),
      currentSummary: scene.summary || '-',
      prevSummary: prev?.summary || '-',
      panelHints,
    });
    const anchorRes = await doChat({
      providerConfig,
      messages: [
        { role: 'system', content: anchorSystemPrompt },
        { role: 'user', content: anchorUserPrompt },
      ],
    });
    tokens = mergeTokenUsage(tokens, anchorRes.tokenUsage);
    const anchorFixed = await fixStructuredOutput({
      prisma,
      teamId,
      providerConfig,
      type: 'scene_anchor',
      raw: anchorRes.content,
      tokenUsage: tokens,
    });
    tokens = anchorFixed.tokenUsage;
    anchorContent = anchorFixed.content;
  }

  await updateProgress({ pct: 25, message: '保存场景锚点...' });
  try {
    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: { sceneDescription: anchorContent, status: 'scene_confirmed' },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  // 2) Keyframe
  let keyframeContent = scene.shotPrompt || '';
  let actionPlanJson: unknown | null = null;
  let keyframeGroupsJson: unknown | null = null;
  if (refinementSettings.skipSteps.shotPrompt) {
    keyframeContent = manualShotPrompt || keyframeContent;
    if (!keyframeContent) {
      throw new UnrecoverableError('Keyframe prompt skipped but no manual override provided');
    }
    await updateProgress({ pct: 30, message: '跳过关键帧生成，使用手动输入...' });
  } else {
    await updateProgress({ pct: 30, message: '生成关键帧提示词...' });
    try {
      await safeUpdateScene({ prisma, projectId, sceneId, data: { status: 'keyframe_generating' } });
    } catch (err) {
      if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
      throw err;
    }

    const cast = (scene.castCharacterIds ?? [])
      .map((id) => ({ id, name: characterNameById.get(id) || id }))
      .filter((c) => c.id);

    const styleMeta = [styleFullPrompt(project), panelHints].filter(Boolean).join('\n\n');

    try {
      const actionPlanRes = await generateActionPlanJson({
        prisma,
        teamId,
        providerConfig,
        sceneId,
        sceneSummary: scene.summary || '-',
        prevSceneSummary: prev?.summary || undefined,
        cast,
        sceneAnchorJson: anchorContent,
        styleFullPrompt: styleMeta,
      });
      tokens = mergeTokenUsage(tokens, actionPlanRes.tokenUsage);
      actionPlanJson = actionPlanRes.plan;

      await updateProgress({ pct: 45, message: '生成 KeyframeGroups（按 beats）...' });
      const keyframeGroupsRes = await generateKeyframeGroupsJson({
        prisma,
        teamId,
        providerConfig,
        sceneId,
        sceneAnchorJson: anchorContent,
        styleFullPrompt: styleMeta,
        cast,
        beats: actionPlanRes.plan.beats,
      });
      tokens = mergeTokenUsage(tokens, keyframeGroupsRes.tokenUsage);
      keyframeGroupsJson = keyframeGroupsRes.keyframeGroups;

      keyframeContent = keyframeGroupsToLegacyShotPrompt(keyframeGroupsRes.keyframeGroups.groups);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateProgress({ pct: 40, message: `ActionBeat 失败，回退直接生成 9 帧 KF0-KF8：${message}` });

      const kfRes = await doChat({
        providerConfig,
        messages: [
          {
            role: 'user',
            content: buildKeyframePrompt({
              style: styleFullPrompt(project),
              currentSummary: scene.summary || '-',
              sceneAnchor: anchorContent,
              characters: project.protagonist || '-',
              panelHints,
            }),
          },
        ],
      });
      tokens = mergeTokenUsage(tokens, kfRes.tokenUsage);
      const kfFixed = await fixStructuredOutput({
        prisma,
        teamId,
        providerConfig,
        type: 'keyframe_prompt',
        raw: kfRes.content,
        tokenUsage: tokens,
      });
      tokens = kfFixed.tokenUsage;
      keyframeContent = kfFixed.content;
    }
  }

  await updateProgress({ pct: 55, message: '保存关键帧...' });
  try {
    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: {
        shotPrompt: keyframeContent,
        ...(actionPlanJson ? { actionPlanJson: actionPlanJson as Prisma.InputJsonValue } : {}),
        ...(keyframeGroupsJson ? { keyframeGroupsJson: keyframeGroupsJson as Prisma.InputJsonValue } : {}),
        status: 'keyframe_confirmed',
      },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  // 3) Motion
  await updateProgress({ pct: 60, message: '生成运动提示词...' });
  try {
    await safeUpdateScene({ prisma, projectId, sceneId, data: { status: 'motion_generating' } });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  const motionSystemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.motion_prompt.system',
  });
  const motionUserPrompt = buildMotionUserPrompt({
    sceneAnchor: anchorContent,
    shotPrompt: keyframeContent,
    panelHints,
  });
  const motionRes = await doChat({
    providerConfig,
    messages: [
      { role: 'system', content: motionSystemPrompt },
      { role: 'user', content: motionUserPrompt },
    ],
  });
  tokens = mergeTokenUsage(tokens, motionRes.tokenUsage);
  const motionFixed = await fixStructuredOutput({
    prisma,
    teamId,
    providerConfig,
    type: 'motion_prompt',
    raw: motionRes.content,
    tokenUsage: tokens,
  });
  tokens = motionFixed.tokenUsage;

  await updateProgress({ pct: 75, message: '保存运动提示词...' });
  try {
    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: { motionPrompt: motionFixed.content, status: 'motion_generating' },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  // 4) Dialogue
  await updateProgress({ pct: 80, message: '生成台词...' });
  const dialogueSystemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.dialogue.system',
  });
  const dialogueUserPrompt = buildDialogueUserPrompt({
    sceneSummary: scene.summary || '-',
    sceneAnchor: anchorContent,
    shotPrompt: keyframeContent,
    motionPrompt: motionFixed.content,
    characters: project.protagonist || '-',
    panelHints,
  });
  const dialogueRes = await doChat({
    providerConfig,
    messages: [
      { role: 'system', content: dialogueSystemPrompt },
      { role: 'user', content: dialogueUserPrompt },
    ],
  });
  tokens = mergeTokenUsage(tokens, dialogueRes.tokenUsage);

  let dialogues = parseDialogueLines(dialogueRes.content);

  if (dialogues.length === 0 && dialogueRes.content?.trim()) {
    const fixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.dialogue.fix.system',
    });
    const fixUserPrompt = buildDialogueFixUserPrompt(dialogueRes.content);
    const fixedRes = await doChat({
      providerConfig,
      messages: [
        { role: 'system', content: fixSystemPrompt },
        { role: 'user', content: fixUserPrompt },
      ],
    });
    tokens = mergeTokenUsage(tokens, fixedRes.tokenUsage);
    dialogues = parseDialogueLines(fixedRes.content);

    if (dialogues.length === 0 && fixedRes.content?.trim()) {
      dialogues = [
        {
          id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          type: 'narration',
          content: fixedRes.content.trim(),
          order: 1,
        },
      ];
    }
  }
  if (dialogues.length === 0) {
    dialogues = [
      {
        id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: 'narration',
        content: '（无台词）',
        order: 1,
      },
    ];
  }

  await updateProgress({ pct: 90, message: '保存台词...' });
  try {
    const nowIso = new Date().toISOString();
    const baseSummary = isRecord(scene.contextSummary) ? scene.contextSummary : {};
    const prevPanelScript = getExistingPanelScript(baseSummary) ?? { version: 1 as const };
    const metrics = computeDialogueMetrics(dialogues);

    const nextPanelScript: PanelScriptV1 = {
      ...prevPanelScript,
      version: 1,
      prompts: {
        ...(isRecord(prevPanelScript.prompts) ? prevPanelScript.prompts : {}),
        sceneAnchor: anchorContent,
        keyframes: keyframeContent,
        motion: motionFixed.content,
      },
      metrics: {
        ...(isRecord(prevPanelScript.metrics) ? prevPanelScript.metrics : {}),
        dialogueLineCount: metrics.dialogueLineCount,
        dialogueCharCount: metrics.dialogueCharCount,
        estimatedSeconds: metrics.estimatedSeconds,
      },
      createdAt: prevPanelScript.createdAt ?? nowIso,
      updatedAt: nowIso,
      source: 'ai',
    };

    const nextContextSummary: Record<string, unknown> = {
      ...(isRecord(baseSummary) ? baseSummary : {}),
      panelScript: nextPanelScript as unknown as Record<string, unknown>,
    };

    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: {
        dialogues: dialogues as unknown as Prisma.InputJsonValue,
        contextSummary: nextContextSummary as unknown as Prisma.InputJsonValue,
        status: 'completed',
      },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  // best-effort: mark episode/project complete
  try {
    const episodeScenes: Array<{ status: string }> = await prisma.scene.findMany({
      where: { episodeId: scene.episodeId },
      select: { status: true },
    });
    const episodeDone = episodeScenes.length > 0 && episodeScenes.every((s) => s.status === 'completed');
    if (episodeDone) {
      await prisma.episode.update({ where: { id: scene.episodeId }, data: { workflowState: 'COMPLETE' } });
    }

    const projectScenes: Array<{ status: string }> = await prisma.scene.findMany({
      where: { projectId },
      select: { status: true },
    });
    const projectDone = projectScenes.length > 0 && projectScenes.every((s) => s.status === 'completed');
    if (projectDone) {
      await prisma.project.update({ where: { id: projectId }, data: { workflowState: 'ALL_SCENES_COMPLETE' } });
    }
  } catch {
    // ignore
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    sceneDescription: anchorContent,
    shotPrompt: keyframeContent,
    motionPrompt: motionFixed.content,
    dialogueCount: dialogues.length,
    tokenUsage: tokens ?? null,
  };
}
