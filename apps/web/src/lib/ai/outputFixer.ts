import type { AIResponse, ChatMessage } from '@/types';
import { getSystemPromptContent } from '@/lib/systemPrompts';
import {
  parseKeyframePromptText,
  parseMotionPromptText,
  parseSceneAnchorText,
} from './promptParsers';

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
      {
        const parsed = parseKeyframePromptText(content);
        return parsed.isStructured && parsed.filledKeyframeCount >= parsed.keyframeKeys.length;
      }
    case 'motion_prompt':
      return parseMotionPromptText(content).isStructured;
    default:
      return false;
  }
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
      const neverType: never = type;
      throw new Error(`Unknown fixable output type: ${String(neverType)}`);
    }
  }
}

function buildFormatFixUserPrompt(raw: string): string {
  const original = raw?.trim() ?? '';
  return ['原始内容：', '<<<', original, '>>>'].join('\n');
}

export async function requestFormatFix(options: {
  chat: (messages: ChatMessage[], options?: { signal?: AbortSignal }) => Promise<AIResponse>;
  type: FixableOutputType;
  raw: string;
  signal?: AbortSignal;
}): Promise<AIResponse> {
  const systemPrompt = await getSystemPromptContent(systemPromptKey(options.type));
  const userPrompt = buildFormatFixUserPrompt(options.raw);
  return options.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { signal: options.signal },
  );
}
