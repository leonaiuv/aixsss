import type { PrismaClient } from '@prisma/client';
import type { ChatMessage, ChatResult, ProviderChatConfig, ResponseFormat } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { parseJsonFromText } from './aiJson.js';
import { STORYBOARD_V2_SHOT_ORDER } from '@aixsss/shared';

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
  return {
    type: 'object',
    additionalProperties: true,
    required: ['storyboard_config', 'shots', 'technical_requirements'],
    properties: {
      storyboard_config: {
        type: 'object',
        additionalProperties: true,
        required: ['layout', 'aspect_ratio', 'style', 'visual_anchor'],
        properties: {
          layout: { type: 'string' },
          aspect_ratio: { type: 'string' },
          style: { type: 'string' },
          visual_anchor: {
            type: 'object',
            additionalProperties: true,
            required: ['character', 'environment', 'lighting', 'mood'],
            properties: {
              character: { type: 'string' },
              environment: { type: 'string' },
              lighting: { type: 'string' },
              mood: { type: 'string' },
            },
          },
        },
      },
      shots: {
        type: 'array',
        minItems: 9,
        maxItems: 9,
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['shot_number', 'type', 'type_cn', 'description', 'angle', 'focus'],
          properties: {
            shot_number: { type: 'string' },
            type: { type: 'string' },
            type_cn: { type: 'string' },
            description: { type: 'string' },
            angle: { type: 'string' },
            focus: { type: 'string' },
          },
        },
      },
      technical_requirements: {
        type: 'object',
        additionalProperties: true,
        required: ['consistency', 'composition', 'quality'],
        properties: {
          consistency: { type: 'string' },
          composition: { type: 'string' },
          quality: { type: 'string' },
        },
      },
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
  const storyboardConfig = o.storyboard_config as Record<string, unknown> | undefined;
  const technical = o.technical_requirements as Record<string, unknown> | undefined;
  const shots = Array.isArray(o.shots) ? o.shots : null;
  if (!storyboardConfig || typeof storyboardConfig !== 'object') return false;
  if (!technical || typeof technical !== 'object') return false;
  if (!shots || shots.length !== STORYBOARD_V2_SHOT_ORDER.length) return false;
  if (typeof storyboardConfig.layout !== 'string') return false;
  if (typeof storyboardConfig.aspect_ratio !== 'string') return false;
  if (typeof storyboardConfig.style !== 'string') return false;
  if (typeof technical.consistency !== 'string') return false;
  if (typeof technical.composition !== 'string') return false;
  if (typeof technical.quality !== 'string') return false;

  for (let i = 0; i < STORYBOARD_V2_SHOT_ORDER.length; i += 1) {
    const shot = shots[i];
    if (!shot || typeof shot !== 'object') return false;
    const s = shot as Record<string, unknown>;
    if (typeof s.shot_number !== 'string') return false;
    if (typeof s.type !== 'string') return false;
    if (s.type !== STORYBOARD_V2_SHOT_ORDER[i]) return false;
    if (typeof s.type_cn !== 'string') return false;
    if (typeof s.description !== 'string') return false;
    if (typeof s.angle !== 'string') return false;
    if (typeof s.focus !== 'string') return false;
  }

  return true;
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
