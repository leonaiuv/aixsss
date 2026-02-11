import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImagesNanoBananaDmxapi } from './nanoBananaDmxapi.js';
import type { ProviderImageConfig } from './types.js';

describe('generateImagesNanoBananaDmxapi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应调用 DMXAPI generateContent 并解析 inlineData 图片', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }],
            },
          },
        ],
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);
    const config: ProviderImageConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: '  Bearer sk-test-key  ',
      model: 'gemini-3-pro-image-preview',
      baseURL: 'https://www.dmxapi.cn/',
      params: { size: '2K' },
    };

    const res = await generateImagesNanoBananaDmxapi(config, '一只可爱的小猫');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.dmxapi.cn/v1beta/models/gemini-3-pro-image-preview:generateContent');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'sk-test-key',
    });
    const body = JSON.parse(String(init.body));
    expect(body.contents?.[0]?.parts?.[0]?.text).toBe('一只可爱的小猫');
    expect(body.generationConfig?.responseModalities).toEqual(['IMAGE']);
    expect(body.generationConfig?.imageConfig?.imageSize).toBe('2K');
    expect(res.images).toEqual([{ url: 'data:image/png;base64,aGVsbG8=' }]);
  });

  it('应兼容 text=data:image/*;base64 返回格式', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'data:image/png;base64,Zm9vYmFy' }],
            },
          },
        ],
      }),
    } as Response);

    const config: ProviderImageConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test-key',
      model: 'gemini-3-pro-image-preview',
    };

    const res = await generateImagesNanoBananaDmxapi(config, '测试图片');
    expect(res.images).toEqual([{ url: 'data:image/png;base64,Zm9vYmFy' }]);
  });

  it('应兼容 fileData.fileUri 返回格式', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ fileData: { fileUri: 'https://cdn.example.com/1.png' } }],
            },
          },
        ],
      }),
    } as Response);

    const config: ProviderImageConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test-key',
      model: 'gemini-3-pro-image-preview',
    };

    const res = await generateImagesNanoBananaDmxapi(config, '测试图片');
    expect(res.images).toEqual([{ url: 'https://cdn.example.com/1.png' }]);
  });

  it('x-goog-api-key 鉴权失败时应回退 Authorization 头', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'invalid api key' } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1n' } }],
              },
            },
          ],
        }),
      } as Response);

    const config: ProviderImageConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test-key',
      model: 'gemini-3-pro-image-preview',
    };

    const res = await generateImagesNanoBananaDmxapi(config, '测试图片');
    expect(res.images).toEqual([{ url: 'data:image/png;base64,aW1n' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init1.headers).toMatchObject({ 'x-goog-api-key': 'sk-test-key' });
    const [, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init2.headers).toMatchObject({ Authorization: 'sk-test-key' });
  });
});
