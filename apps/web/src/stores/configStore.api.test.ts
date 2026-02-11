import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from './configStore';

const mockApiListAIProfiles = vi.fn();
const mockApiUpdateAIProfile = vi.fn();
const mockApiCreateAIProfile = vi.fn();
const mockApiLlmChat = vi.fn();

vi.mock('@/lib/runtime/mode', () => ({ isApiMode: () => true }));
vi.mock('@/lib/api/aiProfiles', () => ({
  apiListAIProfiles: (...args: unknown[]) => mockApiListAIProfiles(...args),
  apiUpdateAIProfile: (...args: unknown[]) => mockApiUpdateAIProfile(...args),
  apiCreateAIProfile: (...args: unknown[]) => mockApiCreateAIProfile(...args),
  apiDeleteAIProfile: vi.fn(),
}));
vi.mock('@/lib/api/llm', () => ({
  apiLlmChat: (...args: unknown[]) => mockApiLlmChat(...args),
}));

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    length: 0,
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => delete store[key],
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

async function flushAsyncEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('configStore (api mode) - image/video api key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMockLocalStorage(),
      writable: true,
    });
    useConfigStore.setState({
      config: null,
      isConfigured: false,
      profiles: [],
      activeProfileId: null,
    });
  });

  it('loadConfig 应保留服务端 hasImageApiKey 标记', async () => {
    mockApiListAIProfiles.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gemini',
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        baseURL: 'https://generativelanguage.googleapis.com',
        generationParams: {
          imageProvider: 'nanobananapro-dmxapi',
          imageModel: 'gemini-3-pro-image-preview',
        },
        pricing: null,
        hasImageApiKey: true,
        hasVideoApiKey: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    useConfigStore.getState().loadConfig();
    await flushAsyncEffects();

    const profile = useConfigStore.getState().profiles[0];
    expect(profile?.hasImageApiKey).toBe(true);
  });

  it('loadConfig 应保留服务端 hasVideoApiKey 标记', async () => {
    mockApiListAIProfiles.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gemini',
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        baseURL: 'https://generativelanguage.googleapis.com',
        generationParams: {
          videoProvider: 'doubao-ark',
          videoModel: 'doubao-seedance-1-5-pro-251215',
        },
        pricing: null,
        hasImageApiKey: false,
        hasVideoApiKey: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    useConfigStore.getState().loadConfig();
    await flushAsyncEffects();

    const profile = useConfigStore.getState().profiles[0];
    expect(profile?.hasVideoApiKey).toBe(true);
  });

  it('testConnection 在 API 模式应透传 imageApiKey 到 ai-profile 更新', async () => {
    mockApiListAIProfiles.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gemini',
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        baseURL: 'https://generativelanguage.googleapis.com',
        generationParams: {
          imageProvider: 'nanobananapro-dmxapi',
          imageModel: 'gemini-3-pro-image-preview',
        },
        pricing: null,
        hasImageApiKey: false,
        hasVideoApiKey: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockApiUpdateAIProfile.mockResolvedValue({
      id: 'p1',
      name: 'Gemini',
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      baseURL: 'https://generativelanguage.googleapis.com',
      generationParams: {
        imageProvider: 'nanobananapro-dmxapi',
        imageModel: 'gemini-3-pro-image-preview',
      },
      pricing: null,
      hasImageApiKey: true,
      hasVideoApiKey: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockApiLlmChat.mockResolvedValue({ content: 'pong' });

    useConfigStore.getState().loadConfig();
    await flushAsyncEffects();

    const ok = await useConfigStore.getState().testConnection({
      provider: 'gemini',
      apiKey: 'text-key',
      imageApiKey: 'image-key',
      baseURL: 'https://generativelanguage.googleapis.com',
      model: 'gemini-1.5-pro',
      generationParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        imageProvider: 'nanobananapro-dmxapi',
        imageModel: 'gemini-3-pro-image-preview',
      },
      aiProfileId: 'p1',
    });

    expect(ok).toBe(true);
    expect(mockApiUpdateAIProfile).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        apiKey: 'text-key',
        imageApiKey: 'image-key',
      }),
    );
  });

  it('testConnection 在 API 模式应透传 videoApiKey 到 ai-profile 更新', async () => {
    mockApiListAIProfiles.mockResolvedValue([
      {
        id: 'p1',
        name: 'DeepSeek (text)',
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseURL: 'https://api.deepseek.com',
        generationParams: {
          videoProvider: 'doubao-ark',
          videoModel: 'doubao-seedance-1-5-pro-251215',
          videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        },
        pricing: null,
        hasImageApiKey: false,
        hasVideoApiKey: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockApiUpdateAIProfile.mockResolvedValue({
      id: 'p1',
      name: 'DeepSeek (text)',
      provider: 'deepseek',
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
      generationParams: {
        videoProvider: 'doubao-ark',
        videoModel: 'doubao-seedance-1-5-pro-251215',
        videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      pricing: null,
      hasImageApiKey: false,
      hasVideoApiKey: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockApiLlmChat.mockResolvedValue({ content: 'pong' });

    useConfigStore.getState().loadConfig();
    await flushAsyncEffects();

    const ok = await useConfigStore.getState().testConnection({
      provider: 'deepseek',
      apiKey: 'text-key',
      videoApiKey: 'video-key',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      generationParams: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 2048,
        videoProvider: 'doubao-ark',
        videoModel: 'doubao-seedance-1-5-pro-251215',
        videoBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      aiProfileId: 'p1',
    });

    expect(ok).toBe(true);
    expect(mockApiUpdateAIProfile).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        apiKey: 'text-key',
        videoApiKey: 'video-key',
      }),
    );
  });
});
