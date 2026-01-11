import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';
import { loadSystemPrompt } from './systemPrompts.js';

type DialogueType = 'dialogue' | 'monologue' | 'narration' | 'thought';

type DialogueLine = {
  id: string;
  type: DialogueType;
  characterName?: string;
  content: string;
  order: number;
  emotion?: string;
  notes?: string;
};

const TYPE_MAP: Record<string, DialogueType> = {
  对白: 'dialogue',
  独白: 'monologue',
  旁白: 'narration',
  心理: 'thought',
};

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseDialoguesFromText(text: string): DialogueLine[] {
  const raw = text?.trim();
  if (!raw) return [];

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const dialogues: DialogueLine[] = [];
  let order = 0;

  for (const line of lines) {
    const match = line.match(/^\[(对白|独白|旁白|心理)(?:\|([^\]]+))?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/);
    if (!match) continue;

    const [, typeLabel, rawMeta, characterName, content] = match;
    const type = TYPE_MAP[typeLabel];
    if (!type) continue;

    order += 1;
    const item: DialogueLine = {
      id: genId('dlg'),
      type,
      content: (content || '').trim(),
      order,
    };

    if (characterName && type !== 'narration') {
      item.characterName = characterName.trim();
    }

    if (rawMeta && type !== 'narration') {
      const parts = rawMeta
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length > 0) item.emotion = parts[0];
      if (parts.length > 1) item.notes = parts.slice(1).join(' | ');
    }

    dialogues.push(item);
  }

  return dialogues;
}

function buildUserPrompt(args: {
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

export async function generateDialogue(args: {
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
    select: { id: true, protagonist: true },
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
      contextSummary: true,
      castCharacterIds: true,
    },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.sceneDescription?.trim()) throw new Error('Scene anchor missing');
  if (!scene.shotPrompt?.trim()) throw new Error('Keyframe prompt missing');
  if (!scene.motionPrompt?.trim()) throw new Error('Motion prompt missing');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const panelHints = formatPanelScriptHints(getExistingPanelScript(scene.contextSummary), {
    includeAssets: false,
  });
  const castCharacterIds = scene.castCharacterIds ?? [];
  let castCharacters = '-';
  if (castCharacterIds.length > 0) {
    const characters = await prisma.character.findMany({
      where: { projectId, id: { in: castCharacterIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(characters.map((character) => [character.id, character.name]));
    const orderedNames = castCharacterIds
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name));
    if (orderedNames.length > 0) {
      castCharacters = orderedNames.join('、');
    }
  }

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.dialogue.system',
  });

  const userPrompt = buildUserPrompt({
    sceneSummary: scene.summary || '-',
    sceneAnchor: scene.sceneDescription,
    shotPrompt: scene.shotPrompt,
    motionPrompt: scene.motionPrompt,
    characters: castCharacters,
    panelHints,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成台词...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '解析台词...' });

  let dialogues = parseDialoguesFromText(res.content);

  // If parsing fails, ask once more to reformat.
  if (dialogues.length === 0 && res.content?.trim()) {
    await updateProgress({ pct: 65, message: '输出不规范，正在纠偏...' });
    const fixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.dialogue.fix.system',
    });
    const fixUserPrompt = buildDialogueFixUserPrompt(res.content);
    const fixed = await chatWithProvider(providerConfig, [
      { role: 'system', content: fixSystemPrompt },
      { role: 'user', content: fixUserPrompt },
    ]);
    dialogues = parseDialoguesFromText(fixed.content);
    if (dialogues.length === 0 && fixed.content?.trim()) {
      dialogues = [
        {
          id: genId('dlg'),
          type: 'narration',
          content: fixed.content.trim(),
          order: 1,
        },
      ];
    }
  }

  if (dialogues.length === 0) {
    dialogues = [
      {
        id: genId('dlg'),
        type: 'narration',
        content: '（无台词）',
        order: 1,
      },
    ];
  }

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      dialogues,
      status: 'completed',
    },
  });

  // best-effort: if all scenes completed, mark project as complete
  try {
    const scenes: Array<{ status: string }> = await prisma.scene.findMany({
      where: { projectId },
      select: { status: true },
    });
    const allDone = scenes.length > 0 && scenes.every((scene) => scene.status === 'completed');
    if (allDone) {
      await prisma.project.update({ where: { id: projectId }, data: { workflowState: 'ALL_SCENES_COMPLETE' } });
    }
  } catch {
    // ignore
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    dialogueCount: dialogues.length,
    tokenUsage: res.tokenUsage ?? null,
  };
}
