import type { AIResponse, ChatMessage } from '@/types';
import { parseKeyframePromptText, parseMotionPromptText, parseSceneAnchorText } from './promptParsers';

export type FixableOutputType = 'scene_anchor' | 'keyframe_prompt' | 'motion_prompt';
export type TokenUsage = NonNullable<AIResponse['tokenUsage']>;

export function mergeTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage | undefined {
  if (!a && !b) return undefined;
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}

export function isStructuredOutput(type: FixableOutputType, text: string): boolean {
  const content = text?.trim() ?? '';
  if (!content) return false;

  switch (type) {
    case 'scene_anchor':
      return parseSceneAnchorText(content).isStructured;
    case 'keyframe_prompt':
      return parseKeyframePromptText(content).isStructured;
    case 'motion_prompt':
      return parseMotionPromptText(content).isStructured;
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

export async function requestFormatFix(options: {
  chat: (messages: ChatMessage[], options?: { signal?: AbortSignal }) => Promise<AIResponse>;
  type: FixableOutputType;
  raw: string;
  signal?: AbortSignal;
}): Promise<AIResponse> {
  const prompt = buildFormatFixPrompt(options.type, options.raw);
  return options.chat([{ role: 'user', content: prompt }], { signal: options.signal });
}

