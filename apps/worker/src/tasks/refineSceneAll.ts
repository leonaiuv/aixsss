import type { Prisma, PrismaClient } from '@prisma/client';
import { UnrecoverableError, type JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { fixStructuredOutput } from './formatFix.js';
import { styleFullPrompt, toProviderChatConfig, type TokenUsage, mergeTokenUsage } from './common.js';

function isPrismaNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2025';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

type PanelScriptV1 = {
  version: 1;
  location?: {
    worldViewElementId?: string;
    label?: string;
    notes?: string;
  };
  timeOfDay?: string;
  camera?: string;
  blocking?: string;
  bubbleLayoutNotes?: string;
  charactersPresentIds?: string[];
  props?: string[];
  prompts?: {
    sceneAnchor?: string;
    keyframes?: string;
    motion?: string;
  };
  metrics?: {
    dialogueLineCount?: number;
    dialogueCharCount?: number;
    estimatedSeconds?: number;
  };
  createdAt?: string;
  updatedAt?: string;
  source?: 'ai' | 'manual' | 'import';
};

function getExistingPanelScript(contextSummary: unknown): PanelScriptV1 | null {
  if (!isRecord(contextSummary)) return null;
  const ps = (contextSummary as { panelScript?: unknown }).panelScript;
  if (!isRecord(ps)) return null;
  if ((ps as { version?: unknown }).version !== 1) return null;
  return ps as PanelScriptV1;
}

function formatPanelScriptHints(panelScript: PanelScriptV1 | null): string {
  if (!panelScript) return '';
  const lines: string[] = [];

  const location =
    panelScript.location?.label?.trim() ||
    panelScript.location?.worldViewElementId?.trim() ||
    '';
  if (location) lines.push(`- 地点：${location}`);

  const timeOfDay = panelScript.timeOfDay?.trim() || '';
  if (timeOfDay) lines.push(`- 时间/天气：${timeOfDay}`);

  const camera = panelScript.camera?.trim() || '';
  if (camera) lines.push(`- 镜头：${camera}`);

  const blocking = panelScript.blocking?.trim() || '';
  if (blocking) lines.push(`- 站位/视线：${blocking}`);

  const bubble = panelScript.bubbleLayoutNotes?.trim() || '';
  if (bubble) lines.push(`- 气泡/版面：${bubble}`);

  const props = Array.isArray(panelScript.props)
    ? panelScript.props.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
    : [];
  if (props.length > 0) lines.push(`- 关键道具：${props.join('、')}`);

  if (lines.length === 0) return '';
  return `\n\n## 用户分镜脚本约束（必须尽量遵守）\n${lines.join('\n')}\n`;
}

function buildSceneAnchorPrompt(args: {
  style: string;
  currentSummary: string;
  prevSummary: string;
  panelHints: string;
}): string {
  return `你是专业的提示词工程师与分镜助理。请为“当前分镜”输出可复用的「场景锚点 Scene Anchor」，用于保证多张关键帧/多家图生视频的场景一致性。

## 输入
视觉风格参考（可轻量融入，不要堆砌质量词）:
${args.style}

当前分镜概要:
${args.currentSummary}

上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:
${args.prevSummary}
${args.panelHints}

## 输出格式（严格按行输出）
SCENE_ANCHOR_ZH: ...
SCENE_ANCHOR_EN: ...
LOCK_ZH: 1) ...; 2) ...; 3) ...; ...
LOCK_EN: 1) ...; 2) ...; 3) ...; ...
AVOID_ZH: ...
AVOID_EN: ...`;
}

function buildKeyframePrompt(args: {
  style: string;
  currentSummary: string;
  sceneAnchor: string;
  characters: string;
  panelHints: string;
}): string {
  return `你是专业的绘图/视频关键帧提示词工程师。请在同一背景参考图上输出 3 张「静止」关键帧的“人物差分提示词”：KF0 / KF1 / KF2。

当前分镜概要:
${args.currentSummary}

场景锚点:
${args.sceneAnchor}

视觉风格参考:
${args.style}

角色信息:
${args.characters}
${args.panelHints}

输出格式（严格按行输出）
KF0_ZH: ...
KF0_EN: ...
KF1_ZH: ...
KF1_EN: ...
KF2_ZH: ...
KF2_EN: ...
AVOID_ZH: ...
AVOID_EN: ...`;
}

function buildMotionPrompt(args: { sceneAnchor: string; shotPrompt: string; panelHints: string }): string {
  return `你是图生视频(I2V)提示词工程师。请基于三关键帧生成“描述变化”的运动/时空提示词。

场景锚点:
${args.sceneAnchor}

三关键帧:
${args.shotPrompt}
${args.panelHints}

输出格式（严格按行输出）
MOTION_SHORT_ZH: ...
MOTION_SHORT_EN: ...
MOTION_BEATS_ZH: 0-1s ...; 1-2s ...; 2-3s ...
MOTION_BEATS_EN: 0-1s ...; 1-2s ...; 2-3s ...
CONSTRAINTS_ZH: ...
CONSTRAINTS_EN: ...`;
}

function buildDialoguePrompt(args: {
  sceneSummary: string;
  sceneAnchor: string;
  shotPrompt: string;
  motionPrompt: string;
  characters: string;
  panelHints: string;
}): string {
  return `你是专业影视编剧。请生成可直接用于字幕/配音的台词，确保与关键帧/运动节拍一致且简洁。

分镜概要:
${args.sceneSummary}

场景锚点:
${args.sceneAnchor}

三关键帧:
${args.shotPrompt}

运动提示词:
${args.motionPrompt}

角色:
${args.characters}
${args.panelHints}

输出要求：每条台词一行，格式：
- [对白|情绪] 角色名: 台词内容
- [独白|情绪] 角色名: 台词内容
- [心理|情绪] 角色名: 台词内容
- [旁白] 台词内容
只输出 1-6 行，不要解释。`;
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

async function doChat(config: { providerConfig: ReturnType<typeof toProviderChatConfig>; prompt: string }): Promise<{ content: string; tokenUsage?: TokenUsage }> {
  const messages: ChatMessage[] = [{ role: 'user', content: config.prompt }];
  return chatWithProvider(config.providerConfig, messages);
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
    select: { id: true, episodeId: true, order: true, summary: true, contextSummary: true },
  });
  if (!scene) throw new UnrecoverableError('Scene not found');

  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary));

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

  // 1) Scene anchor
  await updateProgress({ pct: 5, message: '生成场景锚点...' });
  try {
    await safeUpdateScene({ prisma, projectId, sceneId, data: { status: 'scene_generating' } });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  const anchorRes = await doChat({
    providerConfig,
    prompt: buildSceneAnchorPrompt({
      style: styleFullPrompt(project),
      currentSummary: scene.summary || '-',
      prevSummary: prev?.summary || '-',
      panelHints,
    }),
  });
  tokens = mergeTokenUsage(tokens, anchorRes.tokenUsage);
  const anchorFixed = await fixStructuredOutput({
    providerConfig,
    type: 'scene_anchor',
    raw: anchorRes.content,
    tokenUsage: tokens,
  });
  tokens = anchorFixed.tokenUsage;

  await updateProgress({ pct: 25, message: '保存场景锚点...' });
  try {
    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: { sceneDescription: anchorFixed.content, status: 'scene_confirmed' },
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  // 2) Keyframe
  await updateProgress({ pct: 30, message: '生成关键帧提示词...' });
  try {
    await safeUpdateScene({ prisma, projectId, sceneId, data: { status: 'keyframe_generating' } });
  } catch (err) {
    if (isPrismaNotFoundError(err)) throw new UnrecoverableError('Scene not found');
    throw err;
  }

  const kfRes = await doChat({
    providerConfig,
    prompt: buildKeyframePrompt({
      style: styleFullPrompt(project),
      currentSummary: scene.summary || '-',
      sceneAnchor: anchorFixed.content,
      characters: project.protagonist || '-',
      panelHints,
    }),
  });
  tokens = mergeTokenUsage(tokens, kfRes.tokenUsage);
  const kfFixed = await fixStructuredOutput({
    providerConfig,
    type: 'keyframe_prompt',
    raw: kfRes.content,
    tokenUsage: tokens,
  });
  tokens = kfFixed.tokenUsage;

  await updateProgress({ pct: 55, message: '保存关键帧...' });
  try {
    await safeUpdateScene({
      prisma,
      projectId,
      sceneId,
      data: { shotPrompt: kfFixed.content, status: 'keyframe_confirmed' },
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

  const motionRes = await doChat({
    providerConfig,
    prompt: buildMotionPrompt({
      sceneAnchor: anchorFixed.content,
      shotPrompt: kfFixed.content,
      panelHints,
    }),
  });
  tokens = mergeTokenUsage(tokens, motionRes.tokenUsage);
  const motionFixed = await fixStructuredOutput({
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
  const dialogueRes = await doChat({
    providerConfig,
    prompt: buildDialoguePrompt({
      sceneSummary: scene.summary || '-',
      sceneAnchor: anchorFixed.content,
      shotPrompt: kfFixed.content,
      motionPrompt: motionFixed.content,
      characters: project.protagonist || '-',
      panelHints,
    }),
  });
  tokens = mergeTokenUsage(tokens, dialogueRes.tokenUsage);

  let dialogues = parseDialogueLines(dialogueRes.content);
  if (dialogues.length === 0 && dialogueRes.content?.trim()) {
    dialogues = [
      {
        id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        type: 'narration',
        content: dialogueRes.content.trim(),
        order: 1,
      },
    ];
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
        sceneAnchor: anchorFixed.content,
        keyframes: kfFixed.content,
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
    sceneDescription: anchorFixed.content,
    shotPrompt: kfFixed.content,
    motionPrompt: motionFixed.content,
    dialogueCount: dialogues.length,
    tokenUsage: tokens ?? null,
  };
}
