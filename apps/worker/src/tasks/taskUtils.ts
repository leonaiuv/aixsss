import type { JsonValue } from '@prisma/client/runtime/library';
import type { ChatMessage, ChatResult, GenerationParams, ProviderChatConfig } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';

export type DbProviderType = 'deepseek' | 'kimi' | 'gemini' | 'openai_compatible' | 'doubao_ark';

export type TaskProgress = {
  pct: number;
  message: string;
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function styleFullPrompt(project: { style: string; artStyleConfig: JsonValue | null }): string {
  if (project.artStyleConfig && isRecord(project.artStyleConfig)) {
    const fullPrompt = project.artStyleConfig['fullPrompt'];
    if (typeof fullPrompt === 'string' && fullPrompt.trim()) return fullPrompt.trim();
  }
  return project.style || '';
}

export function toProviderConfig(profile: {
  provider: DbProviderType;
  model: string;
  baseURL: string | null;
  generationParams: JsonValue | null;
}): { providerConfig: ProviderChatConfig; params?: GenerationParams } {
  const rawParams = profile.generationParams;
  const params: GenerationParams | undefined =
    rawParams && isRecord(rawParams)
      ? {
          ...(typeof rawParams.temperature === 'number' ? { temperature: rawParams.temperature } : {}),
          ...(typeof rawParams.topP === 'number' ? { topP: rawParams.topP } : {}),
          ...(typeof rawParams.maxTokens === 'number' ? { maxTokens: rawParams.maxTokens } : {}),
          ...(typeof rawParams.presencePenalty === 'number' ? { presencePenalty: rawParams.presencePenalty } : {}),
          ...(typeof rawParams.frequencyPenalty === 'number' ? { frequencyPenalty: rawParams.frequencyPenalty } : {}),
        }
      : undefined;

  const providerConfig: ProviderChatConfig =
    profile.provider === 'gemini'
      ? {
          kind: 'gemini',
          apiKey: '', // fill later
          baseURL: profile.baseURL ?? undefined,
          model: profile.model,
          params,
        }
      : profile.provider === 'doubao_ark'
        ? {
            kind: 'doubao_ark',
            apiKey: '', // fill later
            baseURL: profile.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
            model: profile.model,
            params,
          }
      : {
          kind: 'openai_compatible',
          apiKey: '', // fill later
          baseURL:
            profile.baseURL ??
            (profile.provider === 'deepseek'
              ? 'https://api.deepseek.com'
              : profile.provider === 'kimi'
                ? 'https://api.moonshot.cn'
                : undefined),
          model: profile.model,
          params,
        };

  return { providerConfig, params };
}

export type FixableOutputType = 'scene_anchor' | 'keyframe_prompt' | 'motion_prompt';

export type TokenUsage = ChatResult['tokenUsage'];

export function mergeTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage | undefined {
  if (!a && !b) return undefined;
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}

function hasLinePrefix(text: string, prefix: string): boolean {
  const re = new RegExp(`^\\s*${prefix}\\s*[:：]`, 'm');
  return re.test(text);
}

export function isStructuredOutput(type: FixableOutputType, text: string): boolean {
  const content = text?.trim() ?? '';
  if (!content) return false;

  switch (type) {
    case 'scene_anchor':
      return (
        hasLinePrefix(content, 'SCENE_ANCHOR_ZH') &&
        hasLinePrefix(content, 'SCENE_ANCHOR_EN') &&
        hasLinePrefix(content, 'LOCK_ZH') &&
        hasLinePrefix(content, 'LOCK_EN') &&
        hasLinePrefix(content, 'AVOID_ZH') &&
        hasLinePrefix(content, 'AVOID_EN')
      );
    case 'keyframe_prompt':
      return (
        hasLinePrefix(content, 'KF0_ZH') &&
        hasLinePrefix(content, 'KF0_EN') &&
        hasLinePrefix(content, 'KF1_ZH') &&
        hasLinePrefix(content, 'KF1_EN') &&
        hasLinePrefix(content, 'KF2_ZH') &&
        hasLinePrefix(content, 'KF2_EN') &&
        hasLinePrefix(content, 'AVOID_ZH') &&
        hasLinePrefix(content, 'AVOID_EN')
      );
    case 'motion_prompt':
      return (
        hasLinePrefix(content, 'MOTION_SHORT_ZH') &&
        hasLinePrefix(content, 'MOTION_SHORT_EN') &&
        hasLinePrefix(content, 'MOTION_BEATS_ZH') &&
        hasLinePrefix(content, 'MOTION_BEATS_EN') &&
        hasLinePrefix(content, 'CONSTRAINTS_ZH') &&
        hasLinePrefix(content, 'CONSTRAINTS_EN')
      );
    default:
      return false;
  }
}

export function buildFormatFixPrompt(type: FixableOutputType, raw: string): string {
  const original = raw?.trim() ?? '';

  if (type === 'scene_anchor') {
    return `你刚才的输出不符合“可解析标签格式”。请把下面“原始内容”重新整理为严格的 6 行标签格式。

要求：
1) 尽量保留原始信息，只做“重排/补齐”，不要新增世界观设定或无关细节。
2) 场景锚点只描述环境/空间/光线/固定物件，不要人物，不要动作，不要镜头运动。
3) 必须逐行输出标签（可用 : 或 ：），不要输出代码块/Markdown/解释/多余行。

原始内容：
<<<
${original}
>>>

输出格式（严格 6 行）：
SCENE_ANCHOR_ZH: ...
SCENE_ANCHOR_EN: ...
LOCK_ZH: 1) ...; 2) ...; 3) ...; ...
LOCK_EN: 1) ...; 2) ...; 3) ...; ...
AVOID_ZH: ...
AVOID_EN: ...`;
  }

  if (type === 'keyframe_prompt') {
    return `你刚才的输出不符合“可解析标签格式”。请把下面“原始内容”重新整理为严格的 8 行标签格式（KF0/KF1/KF2 中英双语 + AVOID 中英双语）。

要求：
1) 尽量保留原始信息，只做“重排/补齐”，不要新增与原始无关的剧情或设定。
2) 每个关键帧都是“静止定格瞬间”，避免 then/after/随后/然后/开始/逐渐 等连续过程词。
3) 必须逐行输出标签（可用 : 或 ：），不要输出代码块/Markdown/解释/多余行。

原始内容：
<<<
${original}
>>>

输出格式（严格 8 行）：
KF0_ZH: ...
KF0_EN: ...
KF1_ZH: ...
KF1_EN: ...
KF2_ZH: ...
KF2_EN: ...
AVOID_ZH: ...
AVOID_EN: ...`;
  }

  return `你刚才的输出不符合“可解析标签格式”。请把下面“原始内容”重新整理为严格的 6 行标签格式（短版/分拍/约束，中英双语）。

要求：
1) 只描述变化（KF0→KF1→KF2），不要重述静态画面细节。
2) 必须逐行输出标签（可用 : 或 ：），不要输出代码块/Markdown/解释/多余行。

原始内容：
<<<
${original}
>>>

输出格式（严格 6 行）：
MOTION_SHORT_ZH: ...
MOTION_SHORT_EN: ...
MOTION_BEATS_ZH: 0-1s ...; 1-2s ...; 2-3s ...
MOTION_BEATS_EN: 0-1s ...; 1-2s ...; 2-3s ...
CONSTRAINTS_ZH: ...
CONSTRAINTS_EN: ...`;
}

export async function requestFormatFix(args: {
  providerConfig: ProviderChatConfig;
  type: FixableOutputType;
  raw: string;
}): Promise<ChatResult> {
  const prompt = buildFormatFixPrompt(args.type, args.raw);
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return chatWithProvider(args.providerConfig, messages);
}

export type DialogueType = 'dialogue' | 'monologue' | 'narration' | 'thought';

export type DialogueLine = {
  id: string;
  type: DialogueType;
  characterName?: string;
  content: string;
  order: number;
  emotion?: string;
  notes?: string;
};

const DIALOGUE_TYPE_MAP: Record<string, DialogueType> = {
  对白: 'dialogue',
  独白: 'monologue',
  旁白: 'narration',
  心理: 'thought',
};

export function parseDialoguesFromText(text: string): DialogueLine[] {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n').filter((line) => line.trim());
  const dialogues: DialogueLine[] = [];
  let order = 0;

  for (const line of lines) {
    const match = line.match(/^\[(对白|独白|旁白|心理)(?:\|([^\]]+))?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/);
    if (!match) continue;

    order += 1;
    const [, typeLabel, rawMeta, characterName, content] = match;
    const type = DIALOGUE_TYPE_MAP[typeLabel];

    const dialogue: DialogueLine = {
      id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      content: content.trim(),
      order,
    };

    if (characterName && type !== 'narration') {
      dialogue.characterName = characterName.trim();
    }

    if (rawMeta && type !== 'narration') {
      const parts = rawMeta
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length > 0) {
        dialogue.emotion = parts[0];
      }
      if (parts.length > 1) {
        dialogue.notes = parts.slice(1).join(' | ');
      }
    }

    dialogues.push(dialogue);
  }

  return dialogues;
}

export function createScaledProgress(
  updateProgress: (progress: TaskProgress) => Promise<void>,
  startPct: number,
  endPct: number,
): (progress: TaskProgress) => Promise<void> {
  const start = Math.max(0, Math.min(100, startPct));
  const end = Math.max(0, Math.min(100, endPct));
  const span = end - start;

  return async (progress) => {
    const pct = typeof progress.pct === 'number' ? progress.pct : 0;
    const clamped = Math.max(0, Math.min(100, pct));
    const scaled = start + (clamped / 100) * span;
    await updateProgress({ ...progress, pct: Math.round(scaled) });
  };
}
