import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIFactory, createAIProvider } from '@/lib/ai/factory';
import { DeepSeekProvider } from '@/lib/ai/providers/deepseek';
import { OpenAICompatibleProvider } from '@/lib/ai/providers/openai';
import { ChatMessage, UserConfig } from '@/types';

describe('AI Provider Factory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createAIProvider 应该根据类型返回对应实例', () => {
    expect(createAIProvider('deepseek')).toBeInstanceOf(DeepSeekProvider);
    expect(createAIProvider('openai-compatible')).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('配置缺失时 createClient 应该抛出错误', () => {
    const incompleteConfig = {
      provider: 'deepseek',
      apiKey: '',
      model: '',
    } as UserConfig;

    expect(() => AIFactory.createClient(incompleteConfig)).toThrow('AI配置不完整');
  });

  it('createClient 返回的客户端应调用底层 provider', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const result = await client.chat(messages);

    expect(result.content).toBe('Mock response');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
