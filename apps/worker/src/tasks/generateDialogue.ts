import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { toProviderChatConfig } from './common.js';
import { formatPanelScriptHints, getExistingPanelScript } from './panelScriptHints.js';

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

function buildPrompt(args: {
  sceneSummary: string;
  sceneAnchor: string;
  shotPrompt: string;
  motionPrompt: string;
  characters: string;
  panelHints: string;
}): string {
  return `你是专业影视编剧。请基于分镜信息生成可直接用于字幕/配音的台词，确保与关键帧/运动节拍一致且简洁有力。

## 分镜概要
${args.sceneSummary}

## 场景锚点（环境一致性）
${args.sceneAnchor}

## 三关键帧（静止）
${args.shotPrompt}

## 运动/时空提示词（若已生成）
${args.motionPrompt}

## 场景中的角色
${args.characters}
${args.panelHints}

## 台词类型说明
1. 对白: 角色之间的对话
2. 独白: 单个角色自言自语
3. 旁白: 无角色的画外音叙述
4. 心理: 角色的内心独白/思维活动

## 情绪标注（可选）
可用情绪：激动、兴奋、开心、快乐、悲伤、难过、愤怒、生气、恐惧、害怕、平静、冷静、惊讶、紧张、温柔、坚定

## 输出格式要求（必须可解析）
每条台词占一行，格式如下：
- 对白/独白/心理: [类型|情绪] 角色名: 台词内容
- 旁白: [旁白] 台词内容

补充约束：
1. 仅允许使用上方“场景中的角色”名单，禁止引入未勾选/未出现的角色名。
2. 1-6 行即可，越短越好，但要贴合画面与动作节拍。
3. 如需标注时间点或画外/字幕提示，可把信息追加到情绪后面，用“|”分隔（保持可解析），示例：
   [对白|惊讶|t=1.0s|画外] 林默: 抱歉，我…
4. 只输出台词行，不要额外解释。`;
}

function buildDialogueFixPrompt(raw: string): string {
  const original = raw?.trim() ?? '';
  return `你的上一条回复没有按要求输出“可解析台词行”。请把下面内容改写为严格的台词行列表，并且【只输出台词行】。

要求：
1) 每行必须以 [对白|...] / [独白|...] / [旁白] / [心理|...] 开头
2) 对白/独白/心理 必须包含“角色名: 台词内容”
3) 仅输出 1-6 行，不要解释

原始内容：
<<<
${original}
>>>`;
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
    select: { id: true },
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
      castCharacterIds: true,
      contextSummary: true,
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
  const castCharacters = castCharacterIds.length
    ? await prisma.character.findMany({
        where: { projectId, id: { in: castCharacterIds } },
        select: { id: true, name: true },
      })
    : [];
  const castCharacterMap = new Map(castCharacters.map((character) => [character.id, character]));
  const orderedCastNames = castCharacterIds
    .map((id) => castCharacterMap.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  const charactersList =
    orderedCastNames.length > 0 ? orderedCastNames.map((name) => `- ${name}`).join('\n') : '（无）';
  const prompt = buildPrompt({
    sceneSummary: scene.summary || '-',
    sceneAnchor: scene.sceneDescription,
    shotPrompt: scene.shotPrompt,
    motionPrompt: scene.motionPrompt,
    characters: charactersList,
    panelHints,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成台词...' });

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 60, message: '解析台词...' });

  let dialogues = parseDialoguesFromText(res.content);

  // If parsing fails, ask once more to reformat.
  if (dialogues.length === 0 && res.content?.trim()) {
    await updateProgress({ pct: 65, message: '输出不规范，正在纠偏...' });
    const fixPrompt = buildDialogueFixPrompt(res.content);
    const fixed = await chatWithProvider(providerConfig, [{ role: 'user', content: fixPrompt }]);
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
