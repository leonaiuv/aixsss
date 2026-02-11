import { describe, expect, it } from 'vitest';
import { toProviderImageConfig } from './common.js';

describe('toProviderImageConfig - image provider routing', () => {
  it('当 imageProvider=nanobananapro-dmxapi 时应路由到独立 provider', () => {
    const config = toProviderImageConfig({
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      baseURL: null,
      generationParams: {
        imageProvider: 'nanobananapro-dmxapi',
        imageModel: 'gemini-3-pro-image-preview',
        imageBaseURL: 'https://www.dmxapi.cn',
      },
    });

    expect(config.kind).toBe('nanobanana_dmxapi');
    expect(config.model).toBe('gemini-3-pro-image-preview');
    expect(config.baseURL).toBe('https://www.dmxapi.cn');
  });

  it('当 imageProvider=openai-compatible 时应路由到 openai_compatible provider', () => {
    const config = toProviderImageConfig({
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      baseURL: null,
      generationParams: {
        imageProvider: 'openai-compatible',
        imageModel: 'gpt-image-1',
        imageBaseURL: 'https://api.openai.com',
      },
    });

    expect(config.kind).toBe('openai_compatible');
    expect(config.model).toBe('gpt-image-1');
    expect(config.baseURL).toBe('https://api.openai.com');
  });

  it('当 imageProvider=doubao-ark 时应路由到 doubao_ark provider', () => {
    const config = toProviderImageConfig({
      provider: 'deepseek',
      model: 'deepseek-chat',
      baseURL: 'https://api.deepseek.com',
      generationParams: {
        imageProvider: 'doubao-ark',
        imageModel: 'doubao-seedream-4-5-251128',
        imageBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      },
    });

    expect(config.kind).toBe('doubao_ark');
    expect(config.model).toBe('doubao-seedream-4-5-251128');
    expect(config.baseURL).toBe('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('未显式指定 imageProvider 时应保持原 provider 行为', () => {
    const config = toProviderImageConfig({
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      baseURL: 'https://generativelanguage.googleapis.com',
      generationParams: {
        imageModel: 'gemini-3-pro-image-preview',
      },
    });

    expect(config.kind).toBe('gemini');
    expect(config.model).toBe('gemini-3-pro-image-preview');
    expect(config.baseURL).toBe('https://generativelanguage.googleapis.com');
  });
});
