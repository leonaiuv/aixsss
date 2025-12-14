import type { ChatMessage, ChatResult, ProviderChatConfig } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';

export type FixableOutputType = 'scene_anchor' | 'keyframe_prompt' | 'motion_prompt';

function hasTagLine(text: string, prefix: string): boolean {
  // Accept both ":" and "：" and allow leading whitespace.
  const re = new RegExp(`^\\s*${prefix}\\s*[:：]\\s*.+$`, 'm');
  return re.test(text);
}

export function isStructuredOutput(type: FixableOutputType, text: string): boolean {
  const content = text?.trim() ?? '';
  if (!content) return false;

  switch (type) {
    case 'scene_anchor':
      return (
        hasTagLine(content, 'SCENE_ANCHOR_ZH') &&
        hasTagLine(content, 'SCENE_ANCHOR_EN') &&
        hasTagLine(content, 'LOCK_ZH') &&
        hasTagLine(content, 'LOCK_EN') &&
        hasTagLine(content, 'AVOID_ZH') &&
        hasTagLine(content, 'AVOID_EN')
      );
    case 'keyframe_prompt':
      return (
        hasTagLine(content, 'KF0_ZH') &&
        hasTagLine(content, 'KF0_EN') &&
        hasTagLine(content, 'KF1_ZH') &&
        hasTagLine(content, 'KF1_EN') &&
        hasTagLine(content, 'KF2_ZH') &&
        hasTagLine(content, 'KF2_EN') &&
        hasTagLine(content, 'AVOID_ZH') &&
        hasTagLine(content, 'AVOID_EN')
      );
    case 'motion_prompt':
      return (
        hasTagLine(content, 'MOTION_SHORT_ZH') &&
        hasTagLine(content, 'MOTION_SHORT_EN') &&
        hasTagLine(content, 'MOTION_BEATS_ZH') &&
        hasTagLine(content, 'MOTION_BEATS_EN') &&
        hasTagLine(content, 'CONSTRAINTS_ZH') &&
        hasTagLine(content, 'CONSTRAINTS_EN')
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

async function doChat(config: ProviderChatConfig, prompt: string): Promise<ChatResult> {
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return chatWithProvider(config, messages);
}

export async function fixStructuredOutput(args: {
  providerConfig: ProviderChatConfig;
  type: FixableOutputType;
  raw: string;
  tokenUsage?: TokenUsage;
}): Promise<{ content: string; tokenUsage?: TokenUsage; fixed: boolean }> {
  const rawTrimmed = args.raw?.trim() ?? '';
  if (!rawTrimmed) return { content: '', tokenUsage: args.tokenUsage, fixed: false };
  if (isStructuredOutput(args.type, rawTrimmed)) {
    return { content: rawTrimmed, tokenUsage: args.tokenUsage, fixed: false };
  }

  const fixPrompt = buildFormatFixPrompt(args.type, rawTrimmed);
  const fixed = await doChat(args.providerConfig, fixPrompt);
  const merged = mergeTokenUsage(args.tokenUsage, fixed.tokenUsage);
  const fixedTrimmed = fixed.content?.trim() ?? '';

  // If fix still fails, fall back to original raw.
  if (!fixedTrimmed || !isStructuredOutput(args.type, fixedTrimmed)) {
    return { content: rawTrimmed, tokenUsage: merged, fixed: false };
  }

  return { content: fixedTrimmed, tokenUsage: merged, fixed: true };
}



