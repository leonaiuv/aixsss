import { create } from 'zustand';
import { ChatMessage, UserConfig, type ConfigProfile, type ConnectionTestResult, type UserConfigState } from '@/types';
import { getConfigState, saveConfigState, clearConfig as clearConfigStorage } from '@/lib/storage';
import { AIFactory } from '@/lib/ai/factory';

interface ConfigStore {
  config: UserConfig | null; // 当前可用配置（用于 AI 调用）
  isConfigured: boolean; // 是否已具备可用配置
  profiles: ConfigProfile[];
  activeProfileId: string | null;
  
  // 操作方法
  loadConfig: () => void;
  saveConfig: (config: UserConfig) => void;
  clearConfig: () => void;
  testConnection: (config: UserConfig) => Promise<boolean>;

  // 多档案操作
  setActiveProfile: (profileId: string) => void;
  createProfile: (profile?: Partial<Pick<ConfigProfile, 'name' | 'config' | 'pricing'>>) => string;
  updateProfile: (profileId: string, updates: Partial<Pick<ConfigProfile, 'name' | 'config' | 'pricing' | 'lastTest'>>) => void;
  deleteProfile: (profileId: string) => void;
}

function generateProfileId(): string {
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultProfileConfig(): UserConfig {
  return {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
  };
}

function isUsableConfig(config: UserConfig | null): config is UserConfig {
  if (!config) return false;
  return Boolean(config.provider && config.apiKey?.trim() && config.model?.trim());
}

function pickActiveProfile(state: UserConfigState): ConfigProfile {
  return state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
}

function buildConnectionTestResult(
  config: UserConfig,
  error: unknown,
  durationMs: number
): ConnectionTestResult {
  const message = error instanceof Error ? error.message : String(error);

  const statusMatch = message.match(/\((\d{3})\b/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;

  const suggestions: string[] = [];
  const baseURL = typeof config.baseURL === 'string' ? config.baseURL.trim() : '';

  if (!config.apiKey?.trim()) {
    suggestions.push('API Key 为空：请先填写 API Key。');
  }

  if (!config.model?.trim()) {
    suggestions.push('模型名称为空：请先填写模型名称。');
  }

  if (baseURL && /\/v1(beta)?\/?$/.test(baseURL)) {
    suggestions.push('Base URL 不要包含 /v1 或 /v1beta（系统会自动拼接路径）。');
  }

  if (config.provider === 'deepseek') {
    suggestions.push('DeepSeek 默认 Base URL：`https://api.deepseek.com`（可留空使用默认值）。');
    suggestions.push('常用模型示例：`deepseek-chat`、`deepseek-reasoner`。');
  }

  if (config.provider === 'kimi') {
    suggestions.push('Kimi 不需要 Base URL；常用模型示例：`moonshot-v1-8k`、`moonshot-v1-32k`。');
  }

  if (config.provider === 'gemini') {
    suggestions.push('Gemini 默认 Base URL：`https://generativelanguage.googleapis.com`（可留空使用默认值）。');
    suggestions.push('模型示例：`gemini-1.5-flash`、`gemini-1.5-pro`、`gemini-pro`。');
  }

  if (config.provider === 'openai-compatible') {
    suggestions.push('OpenAI 兼容：Base URL 填域名根（不要包含 /v1），系统会拼接 `/v1/chat/completions`。');
    suggestions.push('模型示例：`gpt-4o-mini`、`gpt-4o`、`gpt-3.5-turbo`。');
  }

  if (httpStatus === 401 || httpStatus === 403) {
    suggestions.unshift('鉴权失败：检查 API Key 是否正确/未过期，且对应当前供应商。');
  } else if (httpStatus === 404) {
    suggestions.unshift('资源不存在：检查 Base URL 与模型名称是否正确。');
  } else if (httpStatus === 429) {
    suggestions.unshift('触发限流/配额：稍后重试，或更换模型/提升配额。');
  } else if (typeof httpStatus === 'number' && httpStatus >= 500) {
    suggestions.unshift('服务端异常：稍后重试或切换节点/Base URL。');
  } else {
    suggestions.unshift('网络/跨域问题：检查网络、代理/VPN，以及浏览器控制台的 CORS 报错。');
  }

  return {
    status: 'error',
    testedAt: Date.now(),
    durationMs,
    httpStatus,
    errorMessage: message,
    errorDetail: message,
    suggestions: [...new Set(suggestions)],
  };
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  isConfigured: false,
  profiles: [],
  activeProfileId: null,
  
  loadConfig: () => {
    const storedState = getConfigState();

    // 重要：如果本地已有加密配置但当前无法解密（锁定态），不要覆盖写入
    const hasStoredEncryptedConfig = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('aixs_config'));

    if (!storedState) {
      if (hasStoredEncryptedConfig) {
        set({ config: null, isConfigured: false, profiles: [], activeProfileId: null });
        return;
      }

      const now = new Date().toISOString();
      const id = generateProfileId();
      const bootstrap: UserConfigState = {
        version: 1,
        activeProfileId: id,
        profiles: [
          {
            id,
            name: '默认档案',
            config: getDefaultProfileConfig(),
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      saveConfigState(bootstrap);

      const active = pickActiveProfile(bootstrap);
      set({
        profiles: bootstrap.profiles,
        activeProfileId: bootstrap.activeProfileId,
        config: isUsableConfig(active.config) ? active.config : null,
        isConfigured: isUsableConfig(active.config),
      });
      return;
    }

    const active = pickActiveProfile(storedState);
    set({
      profiles: storedState.profiles,
      activeProfileId: storedState.activeProfileId,
      config: isUsableConfig(active.config) ? active.config : null,
      isConfigured: isUsableConfig(active.config),
    });
  },
  
  saveConfig: (config: UserConfig) => {
    const storedState = getConfigState();
    const now = new Date().toISOString();

    if (!storedState) {
      const id = generateProfileId();
      const next: UserConfigState = {
        version: 1,
        activeProfileId: id,
        profiles: [
          {
            id,
            name: '默认档案',
            config,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      saveConfigState(next);
      set({
        profiles: next.profiles,
        activeProfileId: next.activeProfileId,
        config: isUsableConfig(config) ? config : null,
        isConfigured: isUsableConfig(config),
      });
      return;
    }

    const activeProfileId = storedState.activeProfileId;
    const profiles = storedState.profiles.map((p) =>
      p.id === activeProfileId ? { ...p, config, updatedAt: now } : p
    );
    const next: UserConfigState = { ...storedState, profiles };
    saveConfigState(next);

    set({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      config: isUsableConfig(config) ? config : null,
      isConfigured: isUsableConfig(config),
    });
  },
  
  clearConfig: () => {
    clearConfigStorage();
    set({ 
      config: null, 
      isConfigured: false,
      profiles: [],
      activeProfileId: null,
    });
  },
  
  testConnection: async (config: UserConfig): Promise<boolean> => {
    const startedAt = Date.now();
    try {
      const client = AIFactory.createClient(config);
      const pingMessage: ChatMessage[] = [{ role: 'user', content: 'ping' }];
      
      const response = await client.chat(pingMessage);
      const durationMs = Math.max(0, Date.now() - startedAt);
      const ok = Boolean(response?.content);

      const activeProfileId = get().activeProfileId;
      if (activeProfileId) {
        get().updateProfile(activeProfileId, {
          lastTest: ok
            ? {
                status: 'success',
                testedAt: Date.now(),
                durationMs,
              }
            : {
                status: 'error',
                testedAt: Date.now(),
                durationMs,
                errorMessage: '响应为空',
                suggestions: ['供应商返回了空响应：请检查模型名称与权限，或更换模型后重试。'],
              },
        });
      }
      return ok;
    } catch (error) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      console.error('Connection test failed:', error);

      const activeProfileId = get().activeProfileId;
      if (activeProfileId) {
        get().updateProfile(activeProfileId, {
          lastTest: buildConnectionTestResult(config, error, durationMs),
        });
      }
      return false;
    }
  },

  setActiveProfile: (profileId: string) => {
    const storedState = getConfigState();
    if (!storedState) return;

    if (!storedState.profiles.some((p) => p.id === profileId)) return;

    const next: UserConfigState = { ...storedState, activeProfileId: profileId };
    saveConfigState(next);

    const active = pickActiveProfile(next);
    set({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      config: isUsableConfig(active.config) ? active.config : null,
      isConfigured: isUsableConfig(active.config),
    });
  },

  createProfile: (profile) => {
    const storedState = getConfigState();
    const now = new Date().toISOString();
    const id = generateProfileId();

    const nextProfile: ConfigProfile = {
      id,
      name: profile?.name?.trim() || `新档案 ${id.slice(-4)}`,
      config: profile?.config ?? getDefaultProfileConfig(),
      createdAt: now,
      updatedAt: now,
      pricing: profile?.pricing,
    };

    const next: UserConfigState = storedState
      ? {
          ...storedState,
          activeProfileId: id,
          profiles: [nextProfile, ...storedState.profiles],
        }
      : {
          version: 1,
          activeProfileId: id,
          profiles: [nextProfile],
        };

    saveConfigState(next);

    set({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      config: isUsableConfig(nextProfile.config) ? nextProfile.config : null,
      isConfigured: isUsableConfig(nextProfile.config),
    });

    return id;
  },

  updateProfile: (profileId, updates) => {
    const storedState = getConfigState();
    if (!storedState) return;

    const now = new Date().toISOString();
    const profiles = storedState.profiles.map((p) => {
      if (p.id !== profileId) return p;
      return {
        ...p,
        ...updates,
        name: typeof updates.name === 'string' ? updates.name : p.name,
        config: updates.config ?? p.config,
        updatedAt: now,
      };
    });

    const next: UserConfigState = { ...storedState, profiles };
    saveConfigState(next);

    const active = pickActiveProfile(next);
    set({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      config: isUsableConfig(active.config) ? active.config : null,
      isConfigured: isUsableConfig(active.config),
    });
  },

  deleteProfile: (profileId: string) => {
    const storedState = getConfigState();
    if (!storedState) return;

    const nextProfiles = storedState.profiles.filter((p) => p.id !== profileId);
    if (nextProfiles.length === 0) {
      clearConfigStorage();
      set({ config: null, isConfigured: false, profiles: [], activeProfileId: null });
      return;
    }

    const nextActiveId =
      storedState.activeProfileId === profileId ? nextProfiles[0].id : storedState.activeProfileId;

    const next: UserConfigState = {
      ...storedState,
      activeProfileId: nextActiveId,
      profiles: nextProfiles,
    };

    saveConfigState(next);

    const active = pickActiveProfile(next);
    set({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      config: isUsableConfig(active.config) ? active.config : null,
      isConfigured: isUsableConfig(active.config),
    });
  },
}));
