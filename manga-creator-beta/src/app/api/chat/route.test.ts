import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ai 模块 - 必须在导入之前
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    convertToModelMessages: vi.fn((messages) => messages || []),
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: vi.fn(() => new Response('mock response')),
    })),
  };
});

// Mock @ai-sdk/openai 模块
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const fn = (() => ({})) as (() => object) & { chat: () => object };
    fn.chat = () => ({});
    return fn;
  }),
}));

// 导入要测试的路由
import { POST } from './route';

describe('Chat API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = 'test-api-key';
  });

  describe('POST /api/chat', () => {
    it('应该处理消息并返回流式响应', async () => {
      const { streamText } = await import('ai');
      
      const mockRequest = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: '你好' },
          ],
        }),
      });

      const response = await POST(mockRequest);

      expect(streamText).toHaveBeenCalled();
      expect(response).toBeDefined();
    });

    it('应该使用正确的系统提示词', async () => {
      const { streamText } = await import('ai');
      
      const mockRequest = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: '创建一个项目' },
          ],
        }),
      });

      await POST(mockRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('漫剧创作助手'),
        })
      );
    });

    it('应该包含所有工具', async () => {
      const { streamText } = await import('ai');
      
      const mockRequest = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: '帮我生成分镜' },
          ],
        }),
      });

      await POST(mockRequest);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.objectContaining({
            // 工具名称是 camelCase
            generateScenes: expect.anything(),
            refineScene: expect.anything(),
            batchRefineScenes: expect.anything(),
            exportPrompts: expect.anything(),
          }),
        })
      );
    });

    it('应该处理空消息', async () => {
      const mockRequest = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [],
        }),
      });

      // 应该不抛出错误
      await expect(POST(mockRequest)).resolves.toBeDefined();
    });
  });
});
