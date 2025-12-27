import type { ChatMessage, ChatResult, ProviderChatConfig } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';

export type FixableOutputType = 'scene_anchor' | 'keyframe_prompt' | 'motion_prompt';

/**
 * 尝试解析 JSON，支持提取被代码块包裹的 JSON
 */
function tryParseJson(text: string): { valid: boolean; parsed?: unknown; cleaned?: string } {
  const content = text?.trim() ?? '';
  if (!content) return { valid: false };

  // 尝试提取被 ```json ... ``` 或 ``` ... ``` 包裹的内容
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;

  try {
    const parsed = JSON.parse(jsonStr);
    return { valid: true, parsed, cleaned: jsonStr };
  } catch {
    return { valid: false };
  }
}

/**
 * 验证场景锚点 JSON 结构
 */
function isValidSceneAnchorJson(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.scene === 'object' &&
    typeof o.anchors === 'object' &&
    typeof o.avoid === 'object'
  );
}

/**
 * 验证关键帧提示词 JSON 结构
 */
function isValidKeyframeJson(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.camera === 'object' &&
    typeof o.keyframes === 'object' &&
    typeof o.avoid === 'object'
  );
}

/**
 * 验证运动提示词 JSON 结构
 */
function isValidMotionJson(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.motion === 'object' &&
    typeof o.changes === 'object' &&
    typeof o.constraints === 'object'
  );
}

export function isStructuredOutput(type: FixableOutputType, text: string): boolean {
  const result = tryParseJson(text);
  if (!result.valid || !result.parsed) return false;

  switch (type) {
    case 'scene_anchor':
      return isValidSceneAnchorJson(result.parsed);
    case 'keyframe_prompt':
      return isValidKeyframeJson(result.parsed);
    case 'motion_prompt':
      return isValidMotionJson(result.parsed);
    default:
      return false;
  }
}

/**
 * 清理 JSON 输出（去除代码块包裹）
 */
export function cleanJsonOutput(text: string): string {
  const result = tryParseJson(text);
  return result.cleaned ?? text.trim();
}

export function buildFormatFixPrompt(type: FixableOutputType, raw: string): string {
  const original = raw?.trim() ?? '';

  if (type === 'scene_anchor') {
    return `你刚才的输出不符合"可解析JSON格式"。请把下面"原始内容"重新整理为严格的 JSON 格式。

要求：
1) 尽量保留原始信息，只做"重排/补齐"，不要新增世界观设定或无关细节。
2) 场景锚点只描述环境/空间/光线/固定物件，不要人物，不要动作，不要镜头运动。
3) 只输出 JSON，不要代码块、不要解释、不要多余文字。

原始内容：
<<<
${original}
>>>

输出格式（严格 JSON）：
{
  "scene": {
    "zh": "场景整体描述",
    "en": "Overall scene description"
  },
  "location": {
    "type": "室内/室外/虚拟空间",
    "name": "具体地点名称",
    "details": "空间结构与布局细节"
  },
  "lighting": {
    "type": "自然光/人工光/混合光",
    "direction": "光源方向",
    "color": "光线色温或颜色",
    "intensity": "光照强度描述"
  },
  "atmosphere": {
    "mood": "氛围情绪基调",
    "weather": "天气状况",
    "timeOfDay": "时间段"
  },
  "anchors": {
    "zh": ["锚点物1", "锚点物2", "..."],
    "en": ["anchor1", "anchor2", "..."]
  },
  "avoid": {
    "zh": "不要出现的元素",
    "en": "Elements to avoid"
  }
}`;
  }

  if (type === 'keyframe_prompt') {
    return `你刚才的输出不符合"可解析JSON格式"。请把下面"原始内容"重新整理为严格的 JSON 格式。

要求：
1) 尽量保留原始信息，只做"重排/补齐"，不要新增与原始无关的剧情或设定。
2) 每个关键帧都是"静止定格瞬间"，避免 then/after/随后/然后/开始/逐渐 等连续过程词。
3) 只输出 JSON，不要代码块、不要解释、不要多余文字。

原始内容：
<<<
${original}
>>>

输出格式（严格 JSON）：
{
  "camera": {
    "type": "特写/中景/全景/远景",
    "angle": "正面/侧面/俯视/仰视",
    "aspectRatio": "画面比例"
  },
  "keyframes": {
    "KF0": {
      "zh": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." },
      "en": { "subjects": [...], "usedAnchors": [...], "composition": "...", "bubbleSpace": "..." }
    },
    "KF1": { "zh": {...}, "en": {...} },
    "KF2": { "zh": {...}, "en": {...} }
  },
  "avoid": {
    "zh": "避免元素",
    "en": "Elements to avoid"
  }
}`;
  }

  return `你刚才的输出不符合"可解析JSON格式"。请把下面"原始内容"重新整理为严格的 JSON 格式。

要求：
1) 只描述变化（KF0→KF1→KF2），不要重述静态画面细节。
2) 只输出 JSON，不要代码块、不要解释、不要多余文字。

原始内容：
<<<
${original}
>>>

输出格式（严格 JSON）：
{
  "motion": {
    "short": {
      "zh": "简短运动描述",
      "en": "Short motion description"
    },
    "beats": {
      "zh": { "0-1s": "...", "1-2s": "...", "2-3s": "..." },
      "en": { "0-1s": "...", "1-2s": "...", "2-3s": "..." }
    }
  },
  "changes": {
    "subject": { "zh": [...], "en": [...] },
    "camera": { "zh": [...], "en": [...] },
    "environment": { "zh": [...], "en": [...] }
  },
  "constraints": {
    "zh": "约束条件",
    "en": "Constraints"
  }
}`;
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
  
  // 先尝试清理并验证原始输出
  const cleanedRaw = cleanJsonOutput(rawTrimmed);
  if (isStructuredOutput(args.type, cleanedRaw)) {
    return { content: cleanedRaw, tokenUsage: args.tokenUsage, fixed: false };
  }

  // 需要修复
  const fixPrompt = buildFormatFixPrompt(args.type, rawTrimmed);
  const fixed = await doChat(args.providerConfig, fixPrompt);
  const merged = mergeTokenUsage(args.tokenUsage, fixed.tokenUsage);
  const fixedCleaned = cleanJsonOutput(fixed.content ?? '');

  // If fix still fails, fall back to original raw (cleaned).
  if (!fixedCleaned || !isStructuredOutput(args.type, fixedCleaned)) {
    return { content: cleanedRaw || rawTrimmed, tokenUsage: merged, fixed: false };
  }

  return { content: fixedCleaned, tokenUsage: merged, fixed: true };
}



