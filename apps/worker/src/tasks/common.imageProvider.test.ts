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
