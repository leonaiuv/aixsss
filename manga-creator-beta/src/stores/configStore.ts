import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * API 配置接口
 */
export interface APIConfig {
  /** API Key */
  apiKey: string;
  /** API 基础 URL */
  baseURL: string;
  /** 模型名称 */
  model: string;
}

/**
 * 配置 Store 状态接口
 */
export interface ConfigState {
  /** API 配置 */
  config: APIConfig;
  /** 是否已配置 */
  isConfigured: boolean;
  /** 设置 API 配置 */
  setConfig: (config: Partial<APIConfig>) => void;
  /** 重置配置 */
  resetConfig: () => void;
  /** 获取请求头 */
  getHeaders: () => Record<string, string>;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: APIConfig = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

/**
 * 配置 Store
 * 
 * 用于存储用户的 API 配置，支持持久化到 localStorage
 */
export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      isConfigured: false,

      setConfig: (newConfig) => {
        set((state) => ({
          config: { ...state.config, ...newConfig },
          isConfigured: !!(newConfig.apiKey || state.config.apiKey),
        }));
      },

      resetConfig: () => {
        set({
          config: DEFAULT_CONFIG,
          isConfigured: false,
        });
      },

      getHeaders: () => {
        const { config } = get();
        return {
          'X-API-Key': config.apiKey,
          'X-Base-URL': config.baseURL,
          'X-Model': config.model,
        };
      },
    }),
    {
      name: 'manga-creator-config',
      partialize: (state) => ({
        config: state.config,
        isConfigured: state.isConfigured,
      }),
    }
  )
);
