import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIFactory, createAIProvider } from '@/lib/ai/factory';
import { DeepSeekProvider } from '@/lib/ai/providers/deepseek';
import { OpenAICompatibleProvider } from '@/lib/ai/providers/openai';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { KimiProvider } from '@/lib/ai/providers/kimi';
import { ChatMessage, UserConfig, ProviderType } from '@/types';

// ==========================================
// createAIProvider 测试
// ==========================================

describe('createAIProvider', () => {
  it('应根据 deepseek 类型返回 DeepSeekProvider 实例', () => {
    const provider = createAIProvider('deepseek');
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('DeepSeek');
  });

  it('应根据 openai-compatible 类型返回 OpenAICompatibleProvider 实例', () => {
    const provider = createAIProvider('openai-compatible');
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe('OpenAI Compatible');
  });

  it('应根据 kimi 类型返回 KimiProvider 实例', () => {
    const provider = createAIProvider('kimi');
    expect(provider).toBeInstanceOf(KimiProvider);
    expect(provider.name).toBe('Kimi');
  });

  it('应根据 gemini 类型返回 GeminiProvider 实例', () => {
    const provider = createAIProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe('Gemini');
  });

  it('不支持的类型应抛出错误', () => {
    expect(() => createAIProvider('unknown' as ProviderType)).toThrow(
      'Unsupported provider: unknown',
    );
  });
});

// ==========================================
// AIFactory.createClient 测试
// ==========================================

describe('AIFactory.createClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('配置验证', () => {
    it('配置缺失 provider 时应抛出错误', () => {
      const config = {
        provider: undefined,
        apiKey: 'key',
        model: 'model',
      } as unknown as UserConfig;

      expect(() => AIFactory.createClient(config)).toThrow('AI配置不完整');
    });

    it('配置缺失 apiKey 时应抛出错误', () => {
      const config = {
        provider: 'deepseek',
        apiKey: '',
        model: 'deepseek-chat',
      } as UserConfig;

      expect(() => AIFactory.createClient(config)).toThrow('AI配置不完整');
    });

    it('配置缺失 model 时应抛出错误', () => {
      const config = {
        provider: 'deepseek',
        apiKey: 'key',
        model: '',
      } as UserConfig;

      expect(() => AIFactory.createClient(config)).toThrow('AI配置不完整');
    });

    it('配置为 null 时应抛出错误', () => {
      expect(() => AIFactory.createClient(null as unknown as UserConfig)).toThrow('AI配置不完整');
    });

    it('配置为 undefined 时应抛出错误', () => {
      expect(() => AIFactory.createClient(undefined as unknown as UserConfig)).toThrow(
        'AI配置不完整',
      );
    });

    it('完整配置应成功创建客户端', () => {
      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      };

      const client = AIFactory.createClient(config);
      expect(client).toBeDefined();
      expect(client.providerName).toBe('DeepSeek');
    });
  });

  describe('chat 方法', () => {
    it('应正确调用底层 provider 并返回响应', async () => {
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

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
      const result = await client.chat(messages);

      expect(result.content).toBe('Mock response');
      expect(result.tokenUsage?.total).toBe(30);
    });

    it('应处理多条消息', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response to conversation' } }],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      });

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = await client.chat(messages);
      expect(result.content).toBe('Response to conversation');
    });

    it('应处理 API 错误', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'invalid-key',
        model: 'deepseek-chat',
      });

      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'DeepSeek API error',
      );
    });

    it('应处理网络错误', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      });

      await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('streamChat 方法', () => {
    it('应返回 AsyncGenerator', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      });

      const stream = client.streamChat([{ role: 'user', content: 'test' }]);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('流式响应无 body 时应抛出错误', async () => {
      const mockResponse = {
        ok: true,
        body: null,
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const client = AIFactory.createClient({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      });

      const stream = client.streamChat([{ role: 'user', content: 'test' }]);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of stream) {
          // consume stream
        }
      }).rejects.toThrow('No response body');
    });
  });
});

// ==========================================
// 不同 Provider 类型测试
// ==========================================

describe('不同 Provider 类型测试', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const providers: Array<{ type: ProviderType; name: string }> = [
    { type: 'deepseek', name: 'DeepSeek' },
    { type: 'openai-compatible', name: 'OpenAI Compatible' },
    { type: 'kimi', name: 'Kimi' },
    { type: 'gemini', name: 'Gemini' },
  ];

  providers.forEach(({ type, name }) => {
    it(`${type} provider 应正确创建并返回名称 ${name}`, () => {
      const client = AIFactory.createClient({
        provider: type,
        apiKey: 'test-key',
        model: 'test-model',
        baseURL: 'https://api.test.com',
      });

      expect(client.providerName).toBe(name);
    });
  });
});

// ==========================================
// 边界情况测试
// ==========================================

describe('边界情况', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应处理空消息数组', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([]);
    expect(result.content).toBe('');
  });

  it('应处理超长消息内容', async () => {
    const longContent = 'a'.repeat(100000);
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response to long message' } }],
        usage: { prompt_tokens: 10000, completion_tokens: 100, total_tokens: 10100 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([{ role: 'user', content: longContent }]);
    expect(result.content).toBe('Response to long message');
  });

  it('应处理包含特殊字符的消息', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '响应: 特殊字符 <>& single-quote' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([{ role: 'user', content: '特殊字符: <>& double-quote' }]);
    expect(result.content).toContain('特殊字符');
  });

  it('应处理包含 emoji 的消息', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello 👋' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([{ role: 'user', content: '😀 🌍 🚀' }]);
    expect(result.content).toBe('Hello 👋');
  });

  it('应处理包含中文的消息', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好，世界！' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([{ role: 'user', content: '请用中文回答' }]);
    expect(result.content).toBe('你好，世界！');
  });

  it('应处理 500 服务器错误', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: { message: 'Server error' } }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow();
  });

  it('应处理 429 速率限制错误', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'Rate limit exceeded' } }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    await expect(client.chat([{ role: 'user', content: 'test' }])).rejects.toThrow();
  });

  it('应处理带 baseURL 的配置', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Response from custom URL' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
      baseURL: 'https://custom-api.example.com',
    });

    await client.chat([{ role: 'user', content: 'test' }]);

    expect(mockFetch.mock.calls[0][0]).toContain('custom-api.example.com');
  });
});

// ==========================================
// API 请求结构测试
// ==========================================

describe('API 请求结构', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DeepSeek 请求应包含正确的 headers', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
      model: 'deepseek-chat',
    });

    await client.chat([{ role: 'user', content: 'test' }]);

    const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer sk-test-key');
  });

  it('DeepSeek 请求应包含正确的 body 结构', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response;

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'sk-test-key',
      model: 'deepseek-chat',
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];

    await client.chat(messages);

    const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(requestInit.body as string);

    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual(messages);
  });
});

// ==========================================
// Token 使用量测试
// ==========================================

describe('Token 使用量', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应正确解析 token 使用量', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    const result = await client.chat([{ role: 'user', content: 'test' }]);

    expect(result.tokenUsage?.prompt).toBe(100);
    expect(result.tokenUsage?.completion).toBe(50);
    expect(result.tokenUsage?.total).toBe(150);
  });

  it('应处理无 token 使用量的响应', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'test' } }],
      }),
    } as Response;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const client = AIFactory.createClient({
      provider: 'openai-compatible',
      apiKey: 'test-key',
      model: 'test-model',
    });

    const result = await client.chat([{ role: 'user', content: 'test' }]);

    expect(result.tokenUsage).toBeUndefined();
  });
});
