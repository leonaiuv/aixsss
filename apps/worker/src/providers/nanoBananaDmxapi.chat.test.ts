import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderChatConfig } from './types.js';
import { chatNanoBananaDmxapi } from './nanoBananaDmxapi.js';

describe('chatNanoBananaDmxapi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应支持多模态 parts 请求并解析 text 输出', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"ok":true}' }],
            },
          },
        ],
      }),
    } as Response);

    const cfg: ProviderChatConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test',
      baseURL: 'https://www.dmxapi.cn',
      model: 'gemini-3-pro-image-preview',
    };

    const res = await chatNanoBananaDmxapi(cfg, [
      {
        role: 'user',
        content: [
          { type: 'text', text: '根据故事生成九宫格分镜 JSON' },
          { type: 'image_url', image_url: { url: 'https://example.com/char.png' } },
          { type: 'image_url', image_url: { url: 'https://example.com/scene.png' } },
        ],
      },
    ]);

    expect(res.content).toContain('"ok":true');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts).toHaveLength(3);
  });

  it('x-goog-api-key 失败后应回退 Authorization', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'invalid key' } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"fixed":true}' }] } }],
        }),
      } as Response);

    const cfg: ProviderChatConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test',
      model: 'gemini-3-pro-image-preview',
      baseURL: 'https://www.dmxapi.cn',
    };

    const res = await chatNanoBananaDmxapi(cfg, [{ role: 'user', content: 'test' }]);
    expect(res.content).toContain('"fixed":true');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('应兼容 inlineData/inline_data 文本输出', async () => {
    const jsonB64 = Buffer.from('{"from":"inlineData"}', 'utf8').toString('base64');
    const textB64 = Buffer.from('{"from":"inline_data"}', 'utf8').toString('base64');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { mimeType: 'application/json', data: jsonB64 } },
                { inline_data: { mime_type: 'text/plain', data: textB64 } },
              ],
            },
          },
        ],
      }),
    } as Response);

    const cfg: ProviderChatConfig = {
      kind: 'nanobanana_dmxapi',
      apiKey: 'sk-test',
      model: 'gemini-3-pro-image-preview',
      baseURL: 'https://www.dmxapi.cn',
    };

    const res = await chatNanoBananaDmxapi(cfg, [{ role: 'user', content: 'test' }]);
    expect(res.content).toContain('"from":"inlineData"');
    expect(res.content).toContain('"from":"inline_data"');
  });
});
