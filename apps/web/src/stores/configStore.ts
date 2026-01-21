import { create } from 'zustand';
import {
  ChatMessage,
  UserConfig,
  type ConfigProfile,
  type ConnectionTestResult,
  type UserConfigState,
} from '@/types';
import { getConfigState, saveConfigState, clearConfig as clearConfigStorage } from '@/lib/storage';
import { AIFactory } from '@/lib/ai/factory';
import { isApiMode } from '@/lib/runtime/mode';
import {
  apiCreateAIProfile,
  apiDeleteAIProfile,
  apiListAIProfiles,
  apiUpdateAIProfile,
} from '@/lib/api/aiProfiles';
import { apiLlmChat } from '@/lib/api/llm';

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
  updateProfile: (
    profileId: string,
    updates: Partial<Pick<ConfigProfile, 'name' | 'config' | 'pricing' | 'lastTest'>>,
  ) => void;
  deleteProfile: (profileId: string) => void;
}

const ACTIVE_AI_PROFILE_KEY = 'aixs_active_ai_profile_id';

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

  // 后端模式：不在浏览器保存 apiKey，仅要求已绑定 aiProfileId
  if (isApiMode()) {
    return Boolean(config.aiProfileId && config.provider && config.model?.trim());
  }

  // 本地模式：仍沿用旧逻辑
  return Boolean(config.provider && config.apiKey?.trim() && config.model?.trim());
}

function pickActiveProfile(state: UserConfigState): ConfigProfile {
  return state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
}

function buildConnectionTestResult(
  config: UserConfig,
  error: unknown,
  durationMs: number,
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
    suggestions.push(
      'Gemini 默认 Base URL：`https://generativelanguage.googleapis.com`（可留空使用默认值）。',
    );
    suggestions.push('模型示例：`gemini-1.5-flash`、`gemini-1.5-pro`、`gemini-pro`。');
  }

  if (config.provider === 'openai-compatible') {
    suggestions.push(
      'OpenAI 兼容：Base URL 填域名根（不要包含 /v1），系统会拼接 `/v1/chat/completions`。',
    );
    suggestions.push(
      'AiHubMix（OpenAI 兼容转发）Base URL：`https://aihubmix.com`（也可粘贴 `https://aihubmix.com/v1`，系统会自动规范化）。',
    );
    suggestions.push(
      'AiHubMix 文档参考：`https://docs.aihubmix.com/cn/api/Aihubmix-Integration`（模型 ID 建议从模型广场复制）。',
    );
    suggestions.push(
      'GPT-5 系列建议模型：`gpt-5` / `gpt-5-mini` / `gpt-5-nano`（系统会优先使用 `/v1/responses` 以保证兼容）。',
    );
    suggestions.push('模型示例：`gpt-4o-mini`、`gpt-4o`、`gpt-3.5-turbo`。');
  }

  if (config.provider === 'doubao-ark') {
    suggestions.push('豆包/方舟(ARK) Base URL：`https://ark.cn-beijing.volces.com/api/v3`。');
    suggestions.push('文本模型示例：`doubao-seed-1-8-251215`、`doubao-seed-1-6-251015`。');
    suggestions.push('图片模型示例：`doubao-seedream-4-5-251128`（可在“图片模型”中单独配置）。');
    suggestions.push(
      '视频模型示例：`doubao-seedance-1-5-pro-251215`（可在“视频模型”中单独配置）。',
    );
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
    if (isApiMode()) {
      // 后端模式：从服务端拉取 AI Profiles，前端不落盘 apiKey
      set({ config: null, isConfigured: false, profiles: [], activeProfileId: null });

      void (async () => {
        try {
          const serverProfiles = await apiListAIProfiles();
          const profiles: ConfigProfile[] = serverProfiles.map((p) => ({
            id: p.id,
            name: p.name,
            config: {
              provider: p.provider,
              apiKey: '', // 不在浏览器保存
              baseURL: p.baseURL ?? undefined,
              model: p.model,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              generationParams: (p.generationParams ?? undefined) as any,
              aiProfileId: p.id,
            },
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pricing: (p.pricing ?? undefined) as any,
          }));

          const savedActive =
            typeof localStorage !== 'undefined'
              ? localStorage.getItem(ACTIVE_AI_PROFILE_KEY)
              : null;
          const activeId =
            savedActive && profiles.some((p) => p.id === savedActive)
              ? savedActive
              : (profiles[0]?.id ?? null);

          const active = activeId ? profiles.find((p) => p.id === activeId) : undefined;
          set({
            profiles,
            activeProfileId: activeId,
            config: active && isUsableConfig(active.config) ? active.config : null,
            isConfigured: Boolean(active && isUsableConfig(active.config)),
          });
        } catch (error) {
          console.error('Failed to load AI profiles (api):', error);
          set({ config: null, isConfigured: false, profiles: [], activeProfileId: null });
        }
      })();

      return;
    }

    const storedState = getConfigState();

    // 重要：如果本地已有加密配置但当前无法解密（锁定态），不要覆盖写入
    const hasStoredEncryptedConfig =
      typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('aixs_config'));

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
      p.id === activeProfileId ? { ...p, config, updatedAt: now } : p,
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
    if (isApiMode()) {
      const startedAt = Date.now();
      const duration = () => Math.max(0, Date.now() - startedAt);

      const activeProfileId = get().activeProfileId;
      const existingServerId =
        typeof activeProfileId === 'string' && !activeProfileId.startsWith('draft_')
          ? activeProfileId
          : null;

      const provider = config.provider;
      const model = config.model;
      const baseURL = typeof config.baseURL === 'string' ? config.baseURL.trim() : '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generationParams = config.generationParams as any;
      const apiKey = config.apiKey?.trim();

      try {
        let aiProfileId = config.aiProfileId || existingServerId;

        // 若已有服务端档案：可选地更新（当用户输入了 apiKey 才更新密钥）
        if (aiProfileId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload: any = {
            provider,
            model,
            ...(provider !== 'kimi' && baseURL ? { baseURL } : {}),
            ...(generationParams !== undefined ? { generationParams } : {}),
            ...(apiKey ? { apiKey } : {}),
          };
          await apiUpdateAIProfile(aiProfileId, payload);
        } else {
          if (!apiKey) throw new Error('API Key 为空：请先填写 API Key。');
          const created = await apiCreateAIProfile({
            name: '连接测试',
            provider,
            apiKey,
            baseURL: provider === 'kimi' ? undefined : baseURL || undefined,
            model,
            generationParams,
          });
          aiProfileId = created.id;

          if (typeof localStorage !== 'undefined')
            localStorage.setItem(ACTIVE_AI_PROFILE_KEY, aiProfileId);
          set({ activeProfileId: aiProfileId });
          // 追加到 profiles（避免必须手动 reload）
          set((state) => ({
            profiles: [
              {
                id: created.id,
                name: created.name,
                config: {
                  provider: created.provider,
                  apiKey: '',
                  baseURL: created.baseURL ?? undefined,
                  model: created.model,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  generationParams: (created.generationParams ?? undefined) as any,
                  aiProfileId: created.id,
                },
                createdAt: created.createdAt,
                updatedAt: created.updatedAt,
              },
              ...state.profiles.filter((p) => p.id !== created.id),
            ],
          }));
        }

        const response = await apiLlmChat({
          aiProfileId: aiProfileId!,
          messages: [{ role: 'user', content: 'ping' }],
        });
        const ok = Boolean(response?.content);

        // 更新 lastTest（仅写入内存态）
        const lastTest: ConnectionTestResult = ok
          ? { status: 'success', testedAt: Date.now(), durationMs: duration() }
          : {
              status: 'error',
              testedAt: Date.now(),
              durationMs: duration(),
              errorMessage: '响应为空',
              suggestions: ['供应商返回了空响应：请检查模型名称与权限，或更换模型后重试。'],
            };

        set((state) => ({
          profiles: state.profiles.map((p) => (p.id === aiProfileId ? { ...p, lastTest } : p)),
        }));

        return ok;
      } catch (error) {
        const lastTest = buildConnectionTestResult(config, error, duration());
        if (activeProfileId) {
          set((state) => ({
            profiles: state.profiles.map((p) =>
              p.id === activeProfileId ? { ...p, lastTest } : p,
            ),
          }));
        }
        return false;
      }
    }

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
    if (isApiMode()) {
      const profiles = get().profiles;
      if (!profiles.some((p) => p.id === profileId)) return;

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_AI_PROFILE_KEY, profileId);
      }

      const active = profiles.find((p) => p.id === profileId);
      set({
        activeProfileId: profileId,
        config: active && isUsableConfig(active.config) ? active.config : null,
        isConfigured: Boolean(active && isUsableConfig(active.config)),
      });
      return;
    }

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
    if (isApiMode()) {
      const now = new Date().toISOString();
      const id = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const nextProfile: ConfigProfile = {
        id,
        name: profile?.name?.trim() || `新档案 ${id.slice(-4)}`,
        config: profile?.config ?? getDefaultProfileConfig(),
        createdAt: now,
        updatedAt: now,
        pricing: profile?.pricing,
      };

      set((state) => ({
        profiles: [nextProfile, ...state.profiles],
        activeProfileId: id,
        config: isUsableConfig(nextProfile.config) ? nextProfile.config : null,
        isConfigured: isUsableConfig(nextProfile.config),
      }));

      return id;
    }

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
    if (isApiMode()) {
      const now = new Date().toISOString();
      const profiles = get().profiles.map((p) => {
        if (p.id !== profileId) return p;
        return {
          ...p,
          ...updates,
          name: typeof updates.name === 'string' ? updates.name : p.name,
          config: updates.config ?? p.config,
          updatedAt: now,
        };
      });

      // 先更新本地状态（让 UI 立即响应）
      const activeId = get().activeProfileId;
      const active = profiles.find((p) => p.id === (activeId || profileId)) || profiles[0];
      set({
        profiles,
        config: active && isUsableConfig(active.config) ? active.config : null,
        isConfigured: Boolean(active && isUsableConfig(active.config)),
      });

      // 后台持久化（最佳努力）
      void (async () => {
        const target = profiles.find((p) => p.id === profileId);
        if (!target) return;

        const cfg = target.config;
        const baseURL = typeof cfg.baseURL === 'string' ? cfg.baseURL.trim() : '';
        const normalizedBaseURL = baseURL ? baseURL : null;

        try {
          if (profileId.startsWith('draft_')) {
            const apiKey = cfg.apiKey?.trim();
            if (!apiKey) throw new Error('API Key 为空：请填写后再保存');

            const created = await apiCreateAIProfile({
              name: target.name,
              provider: cfg.provider,
              apiKey,
              baseURL: cfg.provider === 'kimi' ? undefined : (normalizedBaseURL ?? undefined),
              model: cfg.model,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              generationParams: cfg.generationParams as any,
              id: undefined,
              pricing: target.pricing,
            });

            const nextProfile: ConfigProfile = {
              id: created.id,
              name: created.name,
              config: {
                provider: created.provider,
                apiKey: '', // 不在浏览器保存
                baseURL: created.baseURL ?? undefined,
                model: created.model,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                generationParams: (created.generationParams ?? undefined) as any,
                aiProfileId: created.id,
              },
              createdAt: created.createdAt,
              updatedAt: created.updatedAt,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pricing: (created.pricing ?? target.pricing) as any,
              lastTest: target.lastTest,
            };

            set((state) => {
              const replaced = state.profiles.map((p) => (p.id === profileId ? nextProfile : p));
              if (typeof localStorage !== 'undefined')
                localStorage.setItem(ACTIVE_AI_PROFILE_KEY, created.id);
              return {
                profiles: replaced,
                activeProfileId: created.id,
                config: isUsableConfig(nextProfile.config) ? nextProfile.config : null,
                isConfigured: isUsableConfig(nextProfile.config),
              };
            });
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload: any = {
            ...(typeof target.name === 'string' ? { name: target.name } : {}),
            ...(cfg.provider ? { provider: cfg.provider } : {}),
            ...(typeof cfg.model === 'string' ? { model: cfg.model } : {}),
            ...(cfg.provider !== 'kimi' && normalizedBaseURL !== null
              ? { baseURL: normalizedBaseURL }
              : {}),
            ...(cfg.generationParams !== undefined
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { generationParams: cfg.generationParams as any }
              : {}),
            ...(cfg.apiKey?.trim() ? { apiKey: cfg.apiKey.trim() } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pricing: (target.pricing ?? null) as any,
          };

          const updated = await apiUpdateAIProfile(profileId, payload);
          const nextProfile: ConfigProfile = {
            id: updated.id,
            name: updated.name,
            config: {
              provider: updated.provider,
              apiKey: '',
              baseURL: updated.baseURL ?? undefined,
              model: updated.model,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              generationParams: (updated.generationParams ?? undefined) as any,
              aiProfileId: updated.id,
            },
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pricing: (updated.pricing ?? target.pricing) as any,
            lastTest: target.lastTest,
          };

          set((state) => {
            const replaced = state.profiles.map((p) => (p.id === profileId ? nextProfile : p));
            const activeId2 =
              state.activeProfileId === profileId ? updated.id : state.activeProfileId;
            if (typeof localStorage !== 'undefined' && activeId2)
              localStorage.setItem(ACTIVE_AI_PROFILE_KEY, activeId2);
            const active2 = replaced.find((p) => p.id === activeId2) || replaced[0];
            return {
              profiles: replaced,
              activeProfileId: activeId2,
              config: active2 && isUsableConfig(active2.config) ? active2.config : null,
              isConfigured: Boolean(active2 && isUsableConfig(active2.config)),
            };
          });
        } catch (err) {
          console.error('Failed to persist AI profile (api):', err);
        }
      })();

      return;
    }

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
    if (isApiMode()) {
      if (profileId.startsWith('draft_')) {
        const nextProfiles = get().profiles.filter((p) => p.id !== profileId);
        const nextActiveId =
          get().activeProfileId === profileId
            ? (nextProfiles[0]?.id ?? null)
            : get().activeProfileId;
        const active = nextActiveId ? nextProfiles.find((p) => p.id === nextActiveId) : undefined;
        set({
          profiles: nextProfiles,
          activeProfileId: nextActiveId,
          config: active && isUsableConfig(active.config) ? active.config : null,
          isConfigured: Boolean(active && isUsableConfig(active.config)),
        });
        return;
      }

      void apiDeleteAIProfile(profileId).catch((err) =>
        console.error('Failed to delete AI profile (api):', err),
      );

      const nextProfiles = get().profiles.filter((p) => p.id !== profileId);
      const nextActiveId =
        get().activeProfileId === profileId ? (nextProfiles[0]?.id ?? null) : get().activeProfileId;
      if (typeof localStorage !== 'undefined') {
        if (nextActiveId) localStorage.setItem(ACTIVE_AI_PROFILE_KEY, nextActiveId);
        else localStorage.removeItem(ACTIVE_AI_PROFILE_KEY);
      }
      const active = nextActiveId ? nextProfiles.find((p) => p.id === nextActiveId) : undefined;
      set({
        profiles: nextProfiles,
        activeProfileId: nextActiveId,
        config: active && isUsableConfig(active.config) ? active.config : null,
        isConfigured: Boolean(active && isUsableConfig(active.config)),
      });
      return;
    }

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
