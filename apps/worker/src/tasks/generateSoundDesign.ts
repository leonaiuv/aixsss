import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { SceneSoundDesignSchema, type SceneSoundDesign } from '@aixsss/shared';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, styleFullPrompt, toProviderChatConfig, type TokenUsage } from './common.js';
import { parseJsonFromText } from './aiJson.js';
import { loadSystemPrompt } from './systemPrompts.js';

function parseSoundDesign(raw: string): { parsed: SceneSoundDesign; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: SceneSoundDesignSchema.parse(json), extractedJson };
}

function buildUserPrompt(args: {
  style: string;
  protagonist: string;
  scene: {
    summary: string;
    sceneDescription: string;
    shotPrompt: string;
    motionPrompt: string;
    dialogues: unknown;
    soundDesignJson: unknown;
  };
}): string {
  return [
    '请基于以下信息输出 SceneSoundDesignSchema JSON。',
    '',
    `视觉风格：${args.style || '-'}`,
    `主角设定：${args.protagonist || '-'}`,
    '',
    `分镜概要：${args.scene.summary || '-'}`,
    '场景锚点(JSON)：',
    args.scene.sceneDescription || '-',
    '',
    '关键帧(JSON)：',
    args.scene.shotPrompt || '-',
    '',
    '运动提示(JSON)：',
    args.scene.motionPrompt || '-',
    '',
    '台词(JSON)：',
    JSON.stringify(args.scene.dialogues ?? null),
    '',
    '已有声音设计(JSON，可参考)：',
    JSON.stringify(args.scene.soundDesignJson ?? null),
  ].join('\n');
}

function buildFixPrompt(raw: string): string {
  return ['原始输出：', '<<<', raw?.trim() ?? '', '>>>'].join('\n');
}

export async function generateSoundDesign(args: {
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
      shotPrompt: true,
      motionPrompt: true,
      dialogues: true,
      soundDesignJson: true,
    },
  });
  if (!scene) throw new Error('Scene not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 5, message: '准备声音设计提示词...' });
  await prisma.scene.update({
    where: { id: sceneId },
    data: { status: 'sound_design_generating' },
  });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.sound_design.system',
  });
  const userPrompt = buildUserPrompt({
    style: styleFullPrompt(project),
    protagonist: project.protagonist,
    scene: {
      summary: scene.summary,
      sceneDescription: scene.sceneDescription,
      shotPrompt: scene.shotPrompt,
      motionPrompt: scene.motionPrompt,
      dialogues: scene.dialogues,
      soundDesignJson: scene.soundDesignJson,
    },
  });

  await updateProgress({ pct: 30, message: '调用 AI 生成声音设计...' });

  let tokenUsage: TokenUsage | undefined;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const first = await chatWithProvider(providerConfig, messages);
  tokenUsage = mergeTokenUsage(tokenUsage, first.tokenUsage);

  let parsed: SceneSoundDesign;
  let extractedJson = '';
  try {
    const r = parseSoundDesign(first.content);
    parsed = r.parsed;
    extractedJson = r.extractedJson;
  } catch {
    await updateProgress({ pct: 60, message: '输出格式纠偏中...' });
    const fixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.sound_design.fix.system',
    });
    const fixed = await chatWithProvider(providerConfig, [
      { role: 'system', content: fixSystemPrompt },
      { role: 'user', content: buildFixPrompt(first.content) },
    ]);
    tokenUsage = mergeTokenUsage(tokenUsage, fixed.tokenUsage);
    const r = parseSoundDesign(fixed.content);
    parsed = r.parsed;
    extractedJson = r.extractedJson;
  }

  await updateProgress({ pct: 85, message: '写入声音设计...' });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      soundDesignJson: parsed as unknown as Prisma.InputJsonValue,
      status: 'sound_design_confirmed',
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    cueCount: parsed.cues.length,
    soundDesign: parsed,
    extractedJson,
    tokenUsage: tokenUsage ?? null,
  };
}

