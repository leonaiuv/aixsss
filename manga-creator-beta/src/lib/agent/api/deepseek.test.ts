import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeepSeekClient, DeepSeekConfig, DEFAULT_CONFIG } from './deepseek';

describe('DeepSeek API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该有默认的模型配置', () => {
      expect(DEFAULT_CONFIG.model).toBe('deepseek-chat');
      expect(DEFAULT_CONFIG.baseURL).toBe('https://api.deepseek.com/v1');
    });
  });

  describe('createDeepSeekClient', () => {
    it('应该创建客户端实例', () => {
      const client = createDeepSeekClient({
        apiKey: 'test-api-key',
      });

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it('应该使用自定义配置覆盖默认值', () => {
      const customConfig: DeepSeekConfig = {
        apiKey: 'test-api-key',
        model: 'deepseek-coder',
        baseURL: 'https://custom.api.com',
        maxTokens: 2000,
        temperature: 0.5,
      };

      const client = createDeepSeekClient(customConfig);
      expect(client).toBeDefined();
    });

    it('应该必须提供 apiKey', () => {
      expect(() => {
        createDeepSeekClient({ apiKey: '' });
      }).toThrow('API Key is required');
    });
  });

  describe('chat model', () => {
    it('应该返回 LanguageModel 对象', async () => {
      const client = createDeepSeekClient({
        apiKey: 'test-api-key',
      });

      expect(client.chat).toBeDefined();
      expect(typeof client.chat).toBe('object');
      // LanguageModel 应该有 doStream 和 doGenerate 方法
      expect(client.chat).toHaveProperty('doStream');
      expect(client.chat).toHaveProperty('doGenerate');
    });
  });
});
