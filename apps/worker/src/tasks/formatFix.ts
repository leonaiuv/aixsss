import type { PrismaClient } from '@prisma/client';
import type { ChatMessage, ChatResult, ProviderChatConfig } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';

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

function systemPromptKey(type: FixableOutputType): string {
  switch (type) {
    case 'scene_anchor':
      return 'workflow.format_fix.scene_anchor.system';
    case 'keyframe_prompt':
      return 'workflow.format_fix.keyframe_prompt.system';
    case 'motion_prompt':
      return 'workflow.format_fix.motion_prompt.system';
    default: {
      // exhaustive check
      const neverType: never = type;
      throw new Error(`Unknown fixable output type: ${String(neverType)}`);
    }
  }
}

export function buildFormatFixUserPrompt(raw: string): string {
  const original = raw?.trim() ?? '';
  return ['原始内容：', '<<<', original, '>>>'].join('\n');
}

async function doChat(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  return chatWithProvider(config, messages);
}

export async function fixStructuredOutput(args: {
  prisma: PrismaClient;
  teamId: string;
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
  const systemPrompt = await loadSystemPrompt({
    prisma: args.prisma,
    teamId: args.teamId,
    key: systemPromptKey(args.type),
  });
  const fixUserPrompt = buildFormatFixUserPrompt(rawTrimmed);
  const fixed = await doChat(args.providerConfig, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: fixUserPrompt },
  ]);
  const merged = mergeTokenUsage(args.tokenUsage, fixed.tokenUsage);
  const fixedCleaned = cleanJsonOutput(fixed.content ?? '');

  // If fix still fails, fall back to original raw (cleaned).
  if (!fixedCleaned || !isStructuredOutput(args.type, fixedCleaned)) {
    return { content: cleanedRaw || rawTrimmed, tokenUsage: merged, fixed: false };
  }

  return { content: fixedCleaned, tokenUsage: merged, fixed: true };
}



