import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConfigStore } from './configStore';
import * as storage from '@/lib/storage';
import { AIFactory } from '@/lib/ai/factory';

// Mock storage functions
vi.mock('@/lib/storage', () => ({
  getConfig: vi.fn(() => null),
  saveConfig: vi.fn(),
  clearConfig: vi.fn(),
}));

// Mock AIFactory
vi.mock('@/lib/ai/factory', () => ({
  AIFactory: {
    createClient: vi.fn(() => ({
      chat: vi.fn().mockResolvedValue({ content: 'pong' }),
    })),
  },
}));

describe('configStore', () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: null,
      isConfigured: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have null config', () => {
      const state = useConfigStore.getState();
      expect(state.config).toBeNull();
    });

    it('should have isConfigured as false', () => {
      const state = useConfigStore.getState();
      expect(state.isConfigured).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('should load config from storage', () => {
      const mockConfig = {
        provider: 'deepseek' as const,
        apiKey: 'test-key',
        model: 'deepseek-chat',
      };
      vi.mocked(storage.getConfig).mockReturnValue(mockConfig);

      const { loadConfig } = useConfigStore.getState();
      loadConfig();

      expect(useConfigStore.getState().config).toEqual(mockConfig);
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });

    it('should set isConfigured to false if no config', () => {
      vi.mocked(storage.getConfig).mockReturnValue(null);

      const { loadConfig } = useConfigStore.getState();
      loadConfig();

      expect(useConfigStore.getState().config).toBeNull();
      expect(useConfigStore.getState().isConfigured).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('should save config to storage', () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'new-key',
        model: 'deepseek-chat',
      };

      const { saveConfig } = useConfigStore.getState();
      saveConfig(config);

      expect(storage.saveConfig).toHaveBeenCalledWith(config);
    });

    it('should update state with new config', () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'new-key',
        model: 'deepseek-chat',
      };

      const { saveConfig } = useConfigStore.getState();
      saveConfig(config);

      expect(useConfigStore.getState().config).toEqual(config);
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });

    it('should handle different providers', () => {
      const providers = ['deepseek', 'kimi', 'gemini', 'openai-compatible'] as const;

      providers.forEach((provider) => {
        const config = {
          provider,
          apiKey: 'key',
          model: 'model',
        };

        const { saveConfig } = useConfigStore.getState();
        saveConfig(config);

        expect(useConfigStore.getState().config?.provider).toBe(provider);
      });
    });

    it('should handle config with baseURL', () => {
      const config = {
        provider: 'openai-compatible' as const,
        apiKey: 'key',
        model: 'gpt-4',
        baseURL: 'https://custom.api.com',
      };

      const { saveConfig } = useConfigStore.getState();
      saveConfig(config);

      expect(useConfigStore.getState().config?.baseURL).toBe('https://custom.api.com');
    });
  });

  describe('clearConfig', () => {
    it('should clear config from storage', () => {
      useConfigStore.setState({
        config: { provider: 'deepseek', apiKey: 'key', model: 'model' },
        isConfigured: true,
      });

      const { clearConfig } = useConfigStore.getState();
      clearConfig();

      expect(storage.clearConfig).toHaveBeenCalled();
    });

    it('should reset state', () => {
      useConfigStore.setState({
        config: { provider: 'deepseek', apiKey: 'key', model: 'model' },
        isConfigured: true,
      });

      const { clearConfig } = useConfigStore.getState();
      clearConfig();

      expect(useConfigStore.getState().config).toBeNull();
      expect(useConfigStore.getState().isConfigured).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'valid-key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: 'pong' }),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'invalid-key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockRejectedValue(new Error('Invalid API key')),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });

    it('should return false for empty response', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: 'model',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: '' }),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });

    it('should call AIFactory.createClient with config', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: 'model',
      };

      const { testConnection } = useConfigStore.getState();
      await testConnection(config);

      expect(AIFactory.createClient).toHaveBeenCalledWith(config);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid config changes', () => {
      const { saveConfig, clearConfig } = useConfigStore.getState();

      saveConfig({ provider: 'deepseek', apiKey: 'key1', model: 'model' });
      saveConfig({ provider: 'kimi', apiKey: 'key2', model: 'model2' });
      clearConfig();
      saveConfig({ provider: 'gemini', apiKey: 'key3', model: 'model3' });

      expect(useConfigStore.getState().config?.provider).toBe('gemini');
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });
  });

  describe('provider switching', () => {
    it('should correctly switch between different providers', () => {
      const { saveConfig } = useConfigStore.getState();

      // Switch from deepseek to kimi
      saveConfig({ provider: 'deepseek', apiKey: 'key1', model: 'deepseek-chat' });
      expect(useConfigStore.getState().config?.provider).toBe('deepseek');

      // Switch to kimi
      saveConfig({ provider: 'kimi', apiKey: 'key2', model: 'moonshot-v1-8k' });
      expect(useConfigStore.getState().config?.provider).toBe('kimi');
      expect(useConfigStore.getState().config?.model).toBe('moonshot-v1-8k');

      // Switch to gemini
      saveConfig({ provider: 'gemini', apiKey: 'key3', model: 'gemini-pro' });
      expect(useConfigStore.getState().config?.provider).toBe('gemini');
      expect(useConfigStore.getState().config?.model).toBe('gemini-pro');
    });

    it('should preserve provider-specific settings during switch', () => {
      const { saveConfig } = useConfigStore.getState();

      const openaiConfig = {
        provider: 'openai-compatible' as const,
        apiKey: 'key',
        model: 'gpt-4',
        baseURL: 'https://custom.api.com',
      };

      saveConfig(openaiConfig);
      expect(useConfigStore.getState().config?.baseURL).toBe('https://custom.api.com');

      // Switch back should retain baseURL if provided
      saveConfig({ provider: 'deepseek', apiKey: 'key2', model: 'deepseek-chat' });
      expect(useConfigStore.getState().config?.baseURL).toBeUndefined();
    });
  });

  describe('config validation', () => {
    it('should handle config with empty model', () => {
      const { saveConfig } = useConfigStore.getState();
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: '',
      };

      saveConfig(config);
      expect(useConfigStore.getState().config?.model).toBe('');
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });

    it('should handle config with invalid baseURL format', async () => {
      const config = {
        provider: 'openai-compatible' as const,
        apiKey: 'key',
        model: 'gpt-4',
        baseURL: 'invalid-url-without-protocol',
      };

      vi.mocked(AIFactory.createClient).mockImplementation(() => {
        throw new Error('Invalid baseURL');
      });

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });

    it('should handle baseURL with trailing slash', () => {
      const { saveConfig } = useConfigStore.getState();
      const config = {
        provider: 'openai-compatible' as const,
        apiKey: 'key',
        model: 'gpt-4',
        baseURL: 'https://api.openai.com/',
      };

      saveConfig(config);
      expect(useConfigStore.getState().config?.baseURL).toBe('https://api.openai.com/');
    });
  });

  describe('testConnection edge cases', () => {
    it('should handle connection timeout', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 100)
          )
        ),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    }, 5000);

    it('should handle network error', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });

    it('should handle 401 unauthorized error', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'invalid-key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' }),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });

    it('should handle 429 rate limit error', async () => {
      const config = {
        provider: 'deepseek' as const,
        apiKey: 'key',
        model: 'deepseek-chat',
      };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockRejectedValue({ status: 429, message: 'Rate limit exceeded' }),
      } as any);

      const { testConnection } = useConfigStore.getState();
      const result = await testConnection(config);

      expect(result).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent loadConfig and saveConfig', () => {
      const mockConfig = {
        provider: 'deepseek' as const,
        apiKey: 'loaded-key',
        model: 'deepseek-chat',
      };
      vi.mocked(storage.getConfig).mockReturnValue(mockConfig);

      const { loadConfig, saveConfig } = useConfigStore.getState();
      
      loadConfig();
      saveConfig({ provider: 'kimi', apiKey: 'saved-key', model: 'moonshot-v1' });

      // The last operation should win
      expect(useConfigStore.getState().config?.provider).toBe('kimi');
      expect(useConfigStore.getState().config?.apiKey).toBe('saved-key');
    });

    it('should handle multiple testConnection calls', async () => {
      const config1 = { provider: 'deepseek' as const, apiKey: 'key1', model: 'model1' };
      const config2 = { provider: 'kimi' as const, apiKey: 'key2', model: 'model2' };

      vi.mocked(AIFactory.createClient).mockReturnValue({
        chat: vi.fn().mockResolvedValue({ content: 'pong' }),
      } as any);

      const { testConnection } = useConfigStore.getState();
      
      const results = await Promise.all([
        testConnection(config1),
        testConnection(config2),
      ]);

      expect(results).toEqual([true, true]);
      expect(AIFactory.createClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('state synchronization', () => {
    it('should update isConfigured immediately after saveConfig', () => {
      const { saveConfig } = useConfigStore.getState();
      expect(useConfigStore.getState().isConfigured).toBe(false);

      saveConfig({ provider: 'deepseek', apiKey: 'key', model: 'model' });
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });

    it('should update isConfigured immediately after clearConfig', () => {
      const { saveConfig, clearConfig } = useConfigStore.getState();
      saveConfig({ provider: 'deepseek', apiKey: 'key', model: 'model' });
      expect(useConfigStore.getState().isConfigured).toBe(true);

      clearConfig();
      expect(useConfigStore.getState().isConfigured).toBe(false);
    });

    it('should load config correctly on initialization', () => {
      const mockConfig = {
        provider: 'gemini' as const,
        apiKey: 'init-key',
        model: 'gemini-pro',
      };
      vi.mocked(storage.getConfig).mockReturnValue(mockConfig);

      const { loadConfig } = useConfigStore.getState();
      loadConfig();

      expect(useConfigStore.getState().config).toEqual(mockConfig);
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });
  });
});
