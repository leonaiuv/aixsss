import type { JsonValue } from '@prisma/client/runtime/library';
import type { GenerationParams, ProviderChatConfig } from '../providers/types.js';

export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export function mergeTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage | undefined {
  if (!a && !b) return undefined;
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}

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

function extractGenerationParams(raw: JsonValue | null): GenerationParams | undefined {
  if (!raw || !isRecord(raw)) return undefined;
  const reasoningEffortRaw = raw.reasoningEffort;
  const reasoningEffort =
    reasoningEffortRaw === 'none' ||
    reasoningEffortRaw === 'minimal' ||
    reasoningEffortRaw === 'low' ||
    reasoningEffortRaw === 'medium' ||
    reasoningEffortRaw === 'high' ||
    reasoningEffortRaw === 'xhigh'
      ? reasoningEffortRaw
      : undefined;
  return {
    ...(typeof raw.temperature === 'number' ? { temperature: raw.temperature } : {}),
    ...(typeof raw.topP === 'number' ? { topP: raw.topP } : {}),
    ...(typeof raw.maxTokens === 'number' ? { maxTokens: raw.maxTokens } : {}),
    ...(typeof raw.presencePenalty === 'number' ? { presencePenalty: raw.presencePenalty } : {}),
    ...(typeof raw.frequencyPenalty === 'number' ? { frequencyPenalty: raw.frequencyPenalty } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function defaultBaseURL(provider: 'deepseek' | 'kimi' | 'openai_compatible'): string | undefined {
  switch (provider) {
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'kimi':
      return 'https://api.moonshot.cn';
    case 'openai_compatible':
      return undefined;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export function toProviderChatConfig(profile: {
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai_compatible';
  model: string;
  baseURL: string | null;
  generationParams: JsonValue | null;
}): ProviderChatConfig {
  const params = extractGenerationParams(profile.generationParams);

  if (profile.provider === 'gemini') {
    return {
      kind: 'gemini',
      apiKey: '', // fill later
      baseURL: profile.baseURL ?? undefined,
      model: profile.model,
      params,
    };
  }

  return {
    kind: 'openai_compatible',
    apiKey: '', // fill later
    baseURL: profile.baseURL ?? defaultBaseURL(profile.provider),
    model: profile.model,
    params,
  };
}



