import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserConfig, UserConfigState } from '@/types';
import { useConfigStore } from './configStore';
import { AIFactory } from '@/lib/ai/factory';
import * as storage from '@/lib/storage';

let storedConfigState: UserConfigState | null = null;

vi.mock('@/lib/storage', () => ({
  getConfigState: vi.fn(() => storedConfigState),
  saveConfigState: vi.fn((state: UserConfigState) => {
    storedConfigState = state;
  }),
  clearConfig: vi.fn(() => {
    storedConfigState = null;
  }),
}));

vi.mock('@/lib/ai/factory', () => ({
  AIFactory: {
    createClient: vi.fn(() => ({
      chat: vi.fn().mockResolvedValue({ content: 'pong' }),
    })),
  },
}));

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    length: 0,
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => delete store[key],
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

function buildState(
  profiles: Array<{ id: string; name: string; config: UserConfig }>,
  activeProfileId: string,
): UserConfigState {
  const now = new Date().toISOString();
  return {
    version: 1,
    activeProfileId,
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      config: p.config,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

beforeEach(() => {
  storedConfigState = null;
  vi.clearAllMocks();

  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });

  useConfigStore.setState({
    config: null,
    isConfigured: false,
    profiles: [],
    activeProfileId: null,
  });
});

describe('configStore（多配置档案）', () => {
  it('loadConfig：无配置时应引导创建默认档案，但 config 仍不可用', () => {
    useConfigStore.getState().loadConfig();

    expect(vi.mocked(storage.saveConfigState)).toHaveBeenCalled();
    expect(useConfigStore.getState().profiles.length).toBe(1);
    expect(useConfigStore.getState().activeProfileId).toBeTruthy();
    expect(useConfigStore.getState().config).toBeNull();
    expect(useConfigStore.getState().isConfigured).toBe(false);
  });

  it('loadConfig：本地有加密配置但不可解密时不应覆盖写入', () => {
    localStorage.setItem('aixs_config', 'encrypted_payload');
    storedConfigState = null;

    useConfigStore.getState().loadConfig();

    expect(vi.mocked(storage.saveConfigState)).not.toHaveBeenCalled();
    expect(useConfigStore.getState().profiles).toEqual([]);
    expect(useConfigStore.getState().config).toBeNull();
    expect(useConfigStore.getState().isConfigured).toBe(false);
  });

  it('loadConfig：可用档案应把 config 置为可用', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );

    useConfigStore.getState().loadConfig();

    expect(useConfigStore.getState().isConfigured).toBe(true);
    expect(useConfigStore.getState().config?.apiKey).toBe('k');
    expect(useConfigStore.getState().profiles.length).toBe(1);
  });

  it('saveConfig：应更新当前档案并刷新可用 config', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: '', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    const next: UserConfig = { provider: 'deepseek', apiKey: 'new-key', model: 'deepseek-chat' };
    useConfigStore.getState().saveConfig(next);

    expect(vi.mocked(storage.saveConfigState)).toHaveBeenCalled();
    expect(useConfigStore.getState().isConfigured).toBe(true);
    expect(useConfigStore.getState().config?.apiKey).toBe('new-key');
  });

  it('setActiveProfile：切换档案应更新 activeProfileId 与可用 config', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
        { id: 'p2', name: 'B', config: { provider: 'gemini', apiKey: '', model: 'gemini-pro' } },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    useConfigStore.getState().setActiveProfile('p2');

    expect(useConfigStore.getState().activeProfileId).toBe('p2');
    expect(useConfigStore.getState().config).toBeNull();
    expect(useConfigStore.getState().isConfigured).toBe(false);
  });

  it('createProfile：应创建新档案并切换为 active', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    const id = useConfigStore.getState().createProfile({
      name: 'New',
      config: { provider: 'openai-compatible', apiKey: '', model: 'gpt-4o-mini' },
    });

    expect(id).toBeTruthy();
    expect(useConfigStore.getState().activeProfileId).toBe(id);
    expect(useConfigStore.getState().profiles.length).toBe(2);
    expect(useConfigStore.getState().config).toBeNull();
  });

  it('updateProfile：应更新名称与价格', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    useConfigStore.getState().updateProfile('p1', {
      name: 'Renamed',
      pricing: { currency: 'USD', promptPer1K: 0.001, completionPer1K: 0.002 },
    });

    const profile = useConfigStore.getState().profiles.find((p) => p.id === 'p1');
    expect(profile?.name).toBe('Renamed');
    expect(profile?.pricing?.promptPer1K).toBe(0.001);
  });

  it('deleteProfile：删除 active 后应自动切换到剩余档案', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
        { id: 'p2', name: 'B', config: { provider: 'gemini', apiKey: 'k2', model: 'gemini-pro' } },
      ],
      'p2',
    );
    useConfigStore.getState().loadConfig();

    useConfigStore.getState().deleteProfile('p2');

    expect(useConfigStore.getState().profiles.length).toBe(1);
    expect(useConfigStore.getState().activeProfileId).toBe('p1');
    expect(useConfigStore.getState().config?.apiKey).toBe('k1');
  });

  it('deleteProfile：删除最后一个档案应清空配置', () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    useConfigStore.getState().deleteProfile('p1');

    expect(vi.mocked(storage.clearConfig)).toHaveBeenCalled();
    expect(useConfigStore.getState().profiles).toEqual([]);
    expect(useConfigStore.getState().config).toBeNull();
  });

  it('testConnection：成功时应记录 lastTest 并返回 true', async () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    const ok = await useConfigStore.getState().testConnection({
      provider: 'deepseek',
      apiKey: 'k1',
      model: 'deepseek-chat',
    });

    expect(ok).toBe(true);
    const profile = useConfigStore.getState().profiles.find((p) => p.id === 'p1');
    expect(profile?.lastTest?.status).toBe('success');
  });

  it('testConnection：失败时应记录 lastTest 并返回 false', async () => {
    storedConfigState = buildState(
      [
        {
          id: 'p1',
          name: 'A',
          config: { provider: 'deepseek', apiKey: 'k1', model: 'deepseek-chat' },
        },
      ],
      'p1',
    );
    useConfigStore.getState().loadConfig();

    vi.mocked(AIFactory.createClient).mockImplementationOnce(() => {
      throw new Error('DeepSeek API error (401 Unauthorized) - Invalid API key');
    });

    const ok = await useConfigStore.getState().testConnection({
      provider: 'deepseek',
      apiKey: 'bad',
      model: 'deepseek-chat',
    });

    expect(ok).toBe(false);
    const profile = useConfigStore.getState().profiles.find((p) => p.id === 'p1');
    expect(profile?.lastTest?.status).toBe('error');
    expect(profile?.lastTest?.httpStatus).toBe(401);
  });
});
