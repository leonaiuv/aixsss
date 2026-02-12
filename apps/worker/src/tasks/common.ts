import type { JsonValue } from '@prisma/client/runtime/library';
import type { GenerationParams, ProviderChatConfig, ProviderImageConfig } from '../providers/types.js';

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

export type ModelOverrides = {
  imageModel?: string;
  videoModel?: string;
  imageProvider?: 'nanobananapro-dmxapi' | 'openai-compatible' | 'doubao-ark';
  imageBaseURL?: string;
  videoProvider?: 'doubao-ark';
  videoBaseURL?: string;
};

export function extractModelOverrides(raw: JsonValue | null): ModelOverrides | undefined {
  if (!raw || !isRecord(raw)) return undefined;
  const imageProviderRaw = raw.imageProvider;
  const imageProvider =
    imageProviderRaw === 'nanobananapro-dmxapi' ||
    imageProviderRaw === 'openai-compatible' ||
    imageProviderRaw === 'doubao-ark'
      ? imageProviderRaw
      : undefined;
  const videoProviderRaw = raw.videoProvider;
  const videoProvider = videoProviderRaw === 'doubao-ark' ? videoProviderRaw : undefined;
  return {
    ...(typeof raw.imageModel === 'string' && raw.imageModel.trim() ? { imageModel: raw.imageModel.trim() } : {}),
    ...(typeof raw.videoModel === 'string' && raw.videoModel.trim() ? { videoModel: raw.videoModel.trim() } : {}),
    ...(imageProvider ? { imageProvider } : {}),
    ...(typeof raw.imageBaseURL === 'string' && raw.imageBaseURL.trim()
      ? { imageBaseURL: raw.imageBaseURL.trim() }
      : {}),
    ...(videoProvider ? { videoProvider } : {}),
    ...(typeof raw.videoBaseURL === 'string' && raw.videoBaseURL.trim()
      ? { videoBaseURL: raw.videoBaseURL.trim() }
      : {}),
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
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai_compatible' | 'doubao_ark';
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

  if (profile.provider === 'doubao_ark') {
    return {
      kind: 'doubao_ark',
      apiKey: '', // fill later
      baseURL: profile.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
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

export function toProviderKeyframeChatConfig(profile: {
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai_compatible' | 'doubao_ark';
  model: string;
  baseURL: string | null;
  generationParams: JsonValue | null;
}): { providerConfig: ProviderChatConfig; useImageApiKey: boolean } {
  const params = extractGenerationParams(profile.generationParams);
  const overrides = extractModelOverrides(profile.generationParams ?? null);

  if (overrides?.imageProvider === 'nanobananapro-dmxapi') {
    return {
      providerConfig: {
        kind: 'nanobanana_dmxapi',
        apiKey: '',
        baseURL: overrides.imageBaseURL ?? 'https://www.dmxapi.cn',
        model: overrides.imageModel || 'gemini-3-pro-image-preview',
        params,
      },
      useImageApiKey: true,
    };
  }

  return {
    providerConfig: toProviderChatConfig(profile),
    useImageApiKey: false,
  };
}

export function toProviderImageConfig(profile: {
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai_compatible' | 'doubao_ark';
  model: string;
  baseURL: string | null;
  generationParams?: JsonValue | null;
}): ProviderImageConfig {
  const overrides = extractModelOverrides(profile.generationParams ?? null);

  if (overrides?.imageProvider === 'nanobananapro-dmxapi') {
    return {
      kind: 'nanobanana_dmxapi',
      apiKey: '',
      baseURL: overrides.imageBaseURL ?? 'https://www.dmxapi.cn',
      model: overrides.imageModel || 'gemini-3-pro-image-preview',
    };
  }

  if (overrides?.imageProvider === 'doubao-ark') {
    return {
      kind: 'doubao_ark',
      apiKey: '',
      baseURL: overrides.imageBaseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
      model: overrides.imageModel || 'doubao-seedream-4-5-251128',
    };
  }

  if (overrides?.imageProvider === 'openai-compatible') {
    return {
      kind: 'openai_compatible',
      apiKey: '',
      baseURL: overrides.imageBaseURL ?? 'https://api.openai.com',
      model: overrides.imageModel || 'gpt-image-1',
    };
  }

  const imageModel =
    overrides?.imageModel ??
    (profile.provider === 'doubao_ark' ? 'doubao-seedream-4-5-251128' : profile.model);

  if (profile.provider === 'gemini') {
    return {
      kind: 'gemini',
      apiKey: '',
      baseURL: profile.baseURL ?? undefined,
      model: imageModel,
    };
  }

  if (profile.provider === 'doubao_ark') {
    return {
      kind: 'doubao_ark',
      apiKey: '',
      baseURL: profile.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3',
      model: imageModel,
    };
  }

  return {
    kind: 'openai_compatible',
    apiKey: '',
    baseURL: profile.baseURL ?? defaultBaseURL(profile.provider),
    model: imageModel,
  };
}
