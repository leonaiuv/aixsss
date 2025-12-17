import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatOpenAICompatible } from './openaiCompatible.js';
import type { ProviderChatConfig, ChatMessage } from './types.js';

describe('chatOpenAICompatible (worker)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gpt-5 优先走 /v1/responses，并使用 max_output_tokens', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        output_text: 'hello',
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com/v1',
      model: 'gpt-5',
      params: { temperature: 0.7, maxTokens: 1234, reasoningEffort: 'high' },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    const res = await chatOpenAICompatible(config, messages);

    expect(res.content).toBe('hello');
    expect(res.tokenUsage).toEqual({ prompt: 1, completion: 2, total: 3 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://aihubmix.com/v1/responses');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-5');
    expect(body.input).toEqual(messages);
    expect(body.max_output_tokens).toBe(1234);
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it('gpt-5.2 下 minimal 会自动降级为 none（避免上游 400）', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        output_text: 'ok',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com',
      model: 'gpt-5.2-thinking',
      params: { reasoningEffort: 'minimal', maxTokens: 10 },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    await chatOpenAICompatible(config, messages);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.reasoning).toEqual({ effort: 'none' });
  });

  it('responseFormat 存在时应透传 response_format', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        output_text: '{"ok":true}',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com',
      model: 'gpt-5',
      params: { maxTokens: 10 },
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['ok'],
            properties: { ok: { type: 'boolean' } },
          },
        },
      },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    await chatOpenAICompatible(config, messages);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format?.type).toBe('json_schema');
    expect(body.response_format?.json_schema?.name).toBe('test_schema');
  });

  it('非 gpt-5 默认走 /v1/chat/completions，并使用 max_tokens', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com/',
      model: 'gpt-4o-mini',
      params: { temperature: 0.2, topP: 0.9, maxTokens: 2048 },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    const res = await chatOpenAICompatible(config, messages);

    expect(res.content).toBe('hi');
    expect(res.tokenUsage).toEqual({ prompt: 10, completion: 20, total: 30 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://aihubmix.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(2048);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.9);
  });

  it('responses 输出可从 output[].content[].text 提取（无 output_text 时）', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: 'from-output-array' }] }],
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com',
      model: 'gpt-5-mini',
      params: { maxTokens: 50 },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    const res = await chatOpenAICompatible(config, messages);
    expect(res.content).toBe('from-output-array');
    expect(res.tokenUsage).toEqual({ prompt: 2, completion: 3, total: 5 });
  });

  it('当 /v1/responses 不支持时（404），自动回退到 chat/completions（并使用 max_completion_tokens）', async () => {
    const resp404 = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { message: 'Not found' } }),
      text: async () => 'Not found',
    } as unknown as Response;

    const resp200 = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'fallback-ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    } as Response;

    const mockFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(resp404)
      .mockResolvedValueOnce(resp200);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com/v1',
      model: 'gpt-5',
      params: { temperature: 0.7, topP: 0.9, maxTokens: 321 },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    const res = await chatOpenAICompatible(config, messages);
    expect(res.content).toBe('fallback-ok');

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [url1] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('https://aihubmix.com/v1/responses');

    const [url2, init2] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe('https://aihubmix.com/v1/chat/completions');
    const body2 = JSON.parse(init2.body as string);
    expect(body2.max_completion_tokens).toBe(321);
    expect(body2.max_tokens).toBeUndefined();
    expect(body2.reasoning).toBeUndefined();
    expect(body2.temperature).toBeUndefined();
    expect(body2.top_p).toBeUndefined();
  });

  it('当 chat/completions 提示需要 responses 时，自动切换到 /v1/responses', async () => {
    const resp400 = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Please use /v1/responses for this model' } }),
      text: async () => 'bad request',
    } as unknown as Response;

    const resp200 = {
      ok: true,
      json: async () => ({
        output_text: 'switched',
        usage: { input_tokens: 5, output_tokens: 6, total_tokens: 11 },
      }),
    } as Response;

    const mockFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(resp400)
      .mockResolvedValueOnce(resp200);

    const config: ProviderChatConfig = {
      kind: 'openai_compatible',
      apiKey: 'test-key',
      baseURL: 'https://aihubmix.com',
      model: 'gpt-4o',
      params: { maxTokens: 777 },
    };
    const messages: ChatMessage[] = [{ role: 'user', content: 'ping' }];

    const res = await chatOpenAICompatible(config, messages);
    expect(res.content).toBe('switched');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [url1] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url1).toBe('https://aihubmix.com/v1/chat/completions');
    const [url2, init2] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url2).toBe('https://aihubmix.com/v1/responses');
    const body2 = JSON.parse(init2.body as string);
    expect(body2.max_output_tokens).toBe(777);
  });
});


