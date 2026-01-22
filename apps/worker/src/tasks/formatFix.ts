import type { PrismaClient } from '@prisma/client';
import type { ChatMessage, ChatResult, ProviderChatConfig, ResponseFormat } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { GENERATED_IMAGE_KEYFRAMES } from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';

export type FixableOutputType = 'scene_anchor' | 'keyframe_prompt' | 'motion_prompt';

/**
 * 尝试解析 JSON，支持提取被代码块包裹的 JSON
 */
function tryParseJson(text: string): { valid: boolean; parsed?: unknown; cleaned?: string } {
  const content = text?.trim() ?? '';
  if (!content) return { valid: false };

  try {
    const { json, extractedJson } = parseJsonFromText(content, { expectedKind: 'object' });
    return { valid: true, parsed: json, cleaned: extractedJson };
  } catch {
    return { valid: false };
  }
}

function jsonSchemaFormat(name: string, schema: Record<string, unknown>): ResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

function schemaSceneAnchor(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['scene', 'anchors', 'avoid'],
    properties: {
      scene: {
        type: 'object',
        additionalProperties: true,
        required: ['zh', 'en'],
        properties: {
          zh: { type: 'string' },
          en: { type: 'string' },
        },
      },
      location: { type: 'object', additionalProperties: true },
      lighting: { type: 'object', additionalProperties: true },
      atmosphere: { type: 'object', additionalProperties: true },
      anchors: {
        type: 'object',
        additionalProperties: true,
        required: ['zh', 'en'],
        properties: {
          zh: { type: 'array', minItems: 4, maxItems: 12, items: { type: 'string' } },
          en: { type: 'array', minItems: 4, maxItems: 12, items: { type: 'string' } },
        },
      },
      avoid: {
        type: 'object',
        additionalProperties: true,
        required: ['zh', 'en'],
        properties: {
          zh: { type: 'string' },
          en: { type: 'string' },
        },
      },
    },
  };
}

function schemaKeyframePrompt(): Record<string, unknown> {
  const frame: Record<string, unknown> = {
    type: 'object',
    additionalProperties: true,
    required: ['zh', 'en'],
    properties: {
      zh: { type: 'object', additionalProperties: true },
      en: { type: 'object', additionalProperties: true },
    },
  };

  const keyframesProps: Record<string, unknown> = {};
  const keyframesRequired: string[] = [];
  for (const kf of GENERATED_IMAGE_KEYFRAMES) {
    keyframesProps[kf] = frame;
    keyframesRequired.push(kf);
  }

  return {
    type: 'object',
    additionalProperties: true,
    required: ['camera', 'keyframes', 'avoid'],
    properties: {
      camera: { type: 'object', additionalProperties: true },
      keyframes: {
        type: 'object',
        additionalProperties: true,
        required: keyframesRequired,
        properties: keyframesProps,
      },
      avoid: { type: 'object', additionalProperties: true },
    },
  };
}

function schemaMotionPrompt(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['motion', 'changes', 'constraints'],
    properties: {
      motion: { type: 'object', additionalProperties: true },
      changes: { type: 'object', additionalProperties: true },
      constraints: { type: 'object', additionalProperties: true },
    },
  };
}

export function responseFormatForFixableOutputType(type: FixableOutputType): ResponseFormat {
  switch (type) {
    case 'scene_anchor':
      return jsonSchemaFormat('scene_anchor', schemaSceneAnchor());
    case 'keyframe_prompt':
      return jsonSchemaFormat('keyframe_prompt', schemaKeyframePrompt());
    case 'motion_prompt':
      return jsonSchemaFormat('motion_prompt', schemaMotionPrompt());
    default: {
      const neverType: never = type;
      throw new Error(`Unknown fixable output type: ${String(neverType)}`);
    }
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
  const keyframes = o.keyframes as Record<string, unknown> | undefined;
  if (!keyframes || typeof keyframes !== 'object') return false;

  // 需要包含完整 9 帧（KF0-KF8），否则视为不结构化以触发 format-fix。
  const hasAllKeyframes = GENERATED_IMAGE_KEYFRAMES.every((kf) => {
    const entry = keyframes[kf];
    return entry && typeof entry === 'object';
  });

  return (
    typeof o.camera === 'object' &&
    typeof o.avoid === 'object' &&
    hasAllKeyframes
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
  const fixConfig: ProviderChatConfig = {
    ...args.providerConfig,
    responseFormat: responseFormatForFixableOutputType(args.type),
  };
  const fixed = await doChat(fixConfig, [
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

