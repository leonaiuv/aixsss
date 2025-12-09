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
});
