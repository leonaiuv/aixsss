import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from '@/lib/ai/providers/deepseek';
import { OpenAICompatibleProvider } from '@/lib/ai/providers/openai';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import { ChatMessage } from '@/types';
import { AIProviderConfig } from '@/lib/ai/types';

// ==========================================
// DeepSeekProvider 测试
// ==========================================

describe('DeepSeekProvider', () => {
  const provider = new DeepSeekProvider();
  const defaultConfig: AIProviderConfig = {
    provider: 'deepseek',
    apiKey: 'test-key',
    model: 'deepseek-chat',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本属性', () => {
    it('应有正确的名称', () => {
      expect(provider.name).toBe('DeepSeek');
    });
  });

  describe('chat 方法', () => {
    it('应成功发送请求并返回响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from DeepSeek' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = await provider.chat(messages, defaultConfig);

      expect(result.content).toBe('Hello from DeepSeek');
      expect(result.tokenUsage?.prompt).toBe(10);
      expect(result.tokenUsage?.completion).toBe(20);
      expect(result.tokenUsage?.total).toBe(30);
    });

    it('应使用默认 baseURL', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(mockFetch.mock.calls[0][0]).toContain('api.deepseek.com');
    });

    it('应使用自定义 baseURL', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);
      const customConfig = { ...defaultConfig, baseURL: 'https://custom.api.com' };

      await provider.chat([{ role: 'user', content: 'test' }], customConfig);

      expect(mockFetch.mock.calls[0][0]).toContain('custom.api.com');
    });

    it('应移除 baseURL 末尾的斜杠', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);
      const customConfig = { ...defaultConfig, baseURL: 'https://custom.api.com/' };

      await provider.chat([{ role: 'user', content: 'test' }], customConfig);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('//v1');
    });

    it('应正确处理 API 错误', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], defaultConfig),
      ).rejects.toThrow('DeepSeek API error (401 Unauthorized) - Invalid API key');
    });

    it('应处理 JSON 解析失败的错误响应', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'Server Error Text',
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], defaultConfig),
      ).rejects.toThrow('DeepSeek API error (500 Internal Server Error) - Server Error Text');
    });

    it('应处理文本解析也失败的错误响应', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => {
          throw new Error('Text error');
        },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], defaultConfig),
      ).rejects.toThrow('DeepSeek API error (500 Internal Server Error)');
    });
  });

  describe('streamChat 方法', () => {
    it('应返回 AsyncGenerator 并正确解析流数据', async () => {
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

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('无响应体时应抛出错误', async () => {
      const mockResponse = {
        ok: true,
        body: null,
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of stream) {
          // consume stream
        }
      }).rejects.toThrow('No response body');
    });

    it('应正确处理跨块的数据', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Part1"}}]}\ndata: {"choices":',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('[{"delta":{"content":"Part2"}}]}\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Part1', 'Part2']);
    });

    it('应忽略无效的 JSON 行', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Valid"}}]}\ndata: invalid-json\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Valid']);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ==========================================
// OpenAICompatibleProvider 测试
// ==========================================

describe('OpenAICompatibleProvider', () => {
  const provider = new OpenAICompatibleProvider();
  const defaultConfig: AIProviderConfig = {
    provider: 'openai-compatible',
    apiKey: 'test-key',
    model: 'gpt-3.5-turbo',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本属性', () => {
    it('应有正确的名称', () => {
      expect(provider.name).toBe('OpenAI Compatible');
    });
  });

  describe('chat 方法', () => {
    it('应成功发送请求并返回响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from OpenAI' } }],
          usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = await provider.chat(messages, defaultConfig);

      expect(result.content).toBe('Hello from OpenAI');
      expect(result.tokenUsage?.total).toBe(40);
    });

    it('应使用默认 baseURL', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(mockFetch.mock.calls[0][0]).toContain('api.openai.com');
    });

    it('应处理无 usage 数据的响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(result.content).toBe('test');
      expect(result.tokenUsage).toBeUndefined();
    });

    it('应正确处理 API 错误', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], defaultConfig),
      ).rejects.toThrow('OpenAI API error');
    });
  });

  describe('streamChat 方法', () => {
    it('应正确解析流数据', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Stream"}}]}\n'),
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

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Stream']);
    });
  });
});

// ==========================================
// GeminiProvider 测试
// ==========================================

describe('GeminiProvider', () => {
  const provider = new GeminiProvider();
  const defaultConfig: AIProviderConfig = {
    provider: 'gemini',
    apiKey: 'test-api-key',
    model: 'gemini-pro',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本属性', () => {
    it('应有正确的名称', () => {
      expect(provider.name).toBe('Gemini');
    });
  });

  describe('chat 方法', () => {
    it('应成功发送请求并返回响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = await provider.chat(messages, defaultConfig);

      expect(result.content).toBe('Hello from Gemini');
      expect(result.tokenUsage?.prompt).toBe(10);
      expect(result.tokenUsage?.completion).toBe(20);
      expect(result.tokenUsage?.total).toBe(30);
    });

    it('应使用默认 baseURL', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'test' }] } }],
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(mockFetch.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    });

    it('应正确转换消息格式', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'test' }] } }],
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ];

      await provider.chat(messages, defaultConfig);

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(requestInit.body as string);

      // System message should be converted to user message
      expect(body.contents.length).toBe(4);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toContain('System instruction');
      // Assistant should be converted to model
      expect(body.contents[2].role).toBe('model');
    });

    it('应使用正确的认证头', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'test' }] } }],
        }),
      } as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      const requestInit = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = requestInit.headers as Record<string, string>;

      expect(headers['x-goog-api-key']).toBe('test-api-key');
    });

    it('应处理无 usageMetadata 的响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'test' }] } }],
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(result.tokenUsage).toBeUndefined();
    });

    it('应处理空响应', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [],
        }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const result = await provider.chat([{ role: 'user', content: 'test' }], defaultConfig);

      expect(result.content).toBe('');
    });

    it('应正确处理 API 错误', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { message: 'API key invalid' } }),
      } as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(
        provider.chat([{ role: 'user', content: 'test' }], defaultConfig),
      ).rejects.toThrow('Gemini API error (403 Forbidden) - API key invalid');
    });
  });

  describe('streamChat 方法', () => {
    it('应正确解析 Gemini 流数据格式', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"candidates":[{"content":{"parts":[{"text":" World"}]}}]}\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('应使用正确的流式 URL', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of stream) {
        // consume stream
      }

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('streamGenerateContent');
      expect(url).toContain('alt=sse');
    });

    it('应忽略空数据行', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: \ndata: {"candidates":[{"content":{"parts":[{"text":"Valid"}]}}]}\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const stream = provider.streamChat([{ role: 'user', content: 'test' }], defaultConfig);
      const chunks: string[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Valid']);
    });
  });
});

// ==========================================
// 跨 Provider 边界情况测试
// ==========================================

describe('跨 Provider 边界情况', () => {
  const providers = [
    {
      name: 'DeepSeek',
      instance: new DeepSeekProvider(),
      config: { provider: 'deepseek' as const, apiKey: 'key', model: 'model' },
    },
    {
      name: 'OpenAI',
      instance: new OpenAICompatibleProvider(),
      config: { provider: 'openai-compatible' as const, apiKey: 'key', model: 'model' },
    },
    {
      name: 'Gemini',
      instance: new GeminiProvider(),
      config: { provider: 'gemini' as const, apiKey: 'key', model: 'model' },
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  providers.forEach(({ name, instance, config }) => {
    describe(`${name} Provider`, () => {
      it('应处理空消息数组', async () => {
        const mockResponse = {
          ok: true,
          json: async () =>
            name === 'Gemini'
              ? { candidates: [{ content: { parts: [{ text: '' }] } }] }
              : {
                  choices: [{ message: { content: '' } }],
                  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                },
        } as Response;

        vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

        const result = await instance.chat([], config);
        expect(result.content).toBeDefined();
      });

      it('应处理网络错误', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

        await expect(instance.chat([{ role: 'user', content: 'test' }], config)).rejects.toThrow(
          'Network failure',
        );
      });

      it('应处理超时', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));

        await expect(instance.chat([{ role: 'user', content: 'test' }], config)).rejects.toThrow(
          'Timeout',
        );
      });
    });
  });
});
