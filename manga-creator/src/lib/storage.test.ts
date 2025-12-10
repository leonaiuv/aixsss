import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encrypt,
  decrypt,
  initStorage,
  saveConfig,
  getConfig,
  clearConfig,
  saveProject,
  getProjects,
  getProject,
  deleteProject,
  saveScene,
  saveScenes,
  getScenes,
  getScene,
  exportData,
  importData,
  clearAllData,
  getStorageUsage,
  configNeedsMigration,
  migrateConfigToNewKey,
  initializeEncryption,
  changeEncryptionPassword,
  hasCustomEncryptionPassword,
  getLegacyEncryptionKey,
  KeyPurpose,
} from '@/lib/storage';
import { KeyManager } from '@/lib/keyManager';
import { Project, Scene, UserConfig } from '@/types';

// ==========================================
// Mock localStorage 工具
// ==========================================

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};

  const mockStorage = {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
  };

  // 返回 Proxy 支持 Object.keys()
  return new Proxy(mockStorage as Storage, {
    ownKeys() {
      return Object.keys(store);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && prop in store) {
        return {
          enumerable: true,
          configurable: true,
          value: store[prop],
        };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });
  // 重置 KeyManager 状态
  KeyManager.reset();
});

// ==========================================
// 加密解密测试
// ==========================================

describe('加密解密功能', () => {
  it('应正确加密和解密字符串（遗留模式）', () => {
    // 未初始化 KeyManager，使用遗留密钥
    const original = 'Hello, World!';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(encrypted).not.toBe(original);
    expect(decrypted).toBe(original);
  });

  it('应正确加密和解密字符串（新密钥模式）', () => {
    initializeEncryption('my-secure-password');
    
    const original = 'Hello, World!';
    const encrypted = encrypt(original, KeyPurpose.CONFIG);
    const decrypted = decrypt(encrypted, KeyPurpose.CONFIG);
    
    expect(encrypted).not.toBe(original);
    expect(decrypted).toBe(original);
  });

  it('应处理空字符串', () => {
    const original = '';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(original);
  });

  it('应处理包含特殊字符的字符串', () => {
    const original = '特殊字符: !@#$%^&*()_+{}|:"<>?`~[]\\;\',./\n\t\r';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(original);
  });

  it('应处理包含中文的字符串', () => {
    const original = '这是一段中文文本，包含各种字符：你好世界！';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(original);
  });

  it('应处理包含 emoji 的字符串', () => {
    const original = 'Hello 👋 World 🌍!';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(original);
  });

  it('应处理非常长的字符串', () => {
    const original = 'a'.repeat(10000);
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(original);
  });

  it('解密无效数据应返回空字符串', () => {
    const invalidEncrypted = 'invalid-encrypted-data';
    const decrypted = decrypt(invalidEncrypted);
    
    expect(decrypted).toBe('');
  });
});

// ==========================================
// 存储初始化测试
// ==========================================

describe('存储初始化', () => {
  it('首次初始化应设置版本号', () => {
    initStorage();
    expect(localStorage.getItem('aixs_version')).toBe('1.2.0');
  });

  it('重复初始化应保持版本号', () => {
    initStorage();
    initStorage();
    expect(localStorage.getItem('aixs_version')).toBe('1.2.0');
  });

  it('从旧版本迁移时应更新版本号', () => {
    localStorage.setItem('aixs_version', '0.0.1');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    initStorage();
    
    expect(localStorage.getItem('aixs_version')).toBe('1.2.0');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('迁移'));
    consoleSpy.mockRestore();
  });
});

// ==========================================
// API 配置测试
// ==========================================

describe('API 配置操作', () => {
  it('应正确保存并读取加密配置', () => {
    const config: UserConfig = {
      provider: 'deepseek',
      apiKey: 'secret',
      model: 'deepseek-chat',
    };

    saveConfig(config);
    expect(getConfig()).toEqual(config);
  });

  it('应处理包含 baseURL 的配置', () => {
    const config: UserConfig = {
      provider: 'openai-compatible',
      apiKey: 'sk-test-key-12345',
      model: 'gpt-4',
      baseURL: 'https://custom-api.example.com',
    };

    saveConfig(config);
    const retrieved = getConfig();
    
    expect(retrieved).toEqual(config);
    expect(retrieved?.baseURL).toBe('https://custom-api.example.com');
  });

  it('没有配置时应返回 null', () => {
    expect(getConfig()).toBeNull();
  });

  it('配置损坏时应返回 null', () => {
    localStorage.setItem('aixs_config', 'corrupted-data');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(getConfig()).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('应正确清除配置', () => {
    const config: UserConfig = {
      provider: 'deepseek',
      apiKey: 'secret',
      model: 'deepseek-chat',
    };

    saveConfig(config);
    expect(getConfig()).not.toBeNull();
    
    clearConfig();
    expect(getConfig()).toBeNull();
  });

  it('应处理所有供应商类型', () => {
    const providers: UserConfig['provider'][] = ['deepseek', 'kimi', 'gemini', 'openai-compatible'];
    
    providers.forEach((provider) => {
      const config: UserConfig = {
        provider,
        apiKey: `key-${provider}`,
        model: `model-${provider}`,
      };
      
      saveConfig(config);
      expect(getConfig()?.provider).toBe(provider);
    });
  });
});

// ==========================================
// 项目操作测试
// ==========================================

describe('项目操作', () => {
  const createTestProject = (overrides: Partial<Project> = {}): Project => ({
    id: `proj_${Date.now()}`,
    title: 'Test Project',
    summary: 'Test summary',
    style: 'ink',
    protagonist: 'hero',
    workflowState: 'DATA_COLLECTING',
    currentSceneOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it('应当保存并获取项目列表', () => {
    const project = createTestProject({ id: 'proj_1', title: 'Demo' });

    saveProject(project);
    expect(getProjects()).toHaveLength(1);
    expect(getProject(project.id)?.title).toBe('Demo');
  });

  it('应处理空项目列表', () => {
    expect(getProjects()).toEqual([]);
    expect(getProject('non-existent')).toBeNull();
  });

  it('应更新已存在的项目', () => {
    const project = createTestProject({ id: 'proj_1', title: 'Original' });
    saveProject(project);
    
    const updatedProject = { ...project, title: 'Updated' };
    saveProject(updatedProject);
    
    expect(getProjects()).toHaveLength(1);
    expect(getProject('proj_1')?.title).toBe('Updated');
  });

  it('应保存多个项目', () => {
    for (let i = 1; i <= 5; i++) {
      saveProject(createTestProject({ id: `proj_${i}`, title: `Project ${i}` }));
    }
    
    expect(getProjects()).toHaveLength(5);
  });

  it('应正确删除项目', () => {
    const project = createTestProject({ id: 'proj_to_delete' });
    saveProject(project);
    expect(getProjects()).toHaveLength(1);
    
    deleteProject('proj_to_delete');
    expect(getProjects()).toHaveLength(0);
    expect(getProject('proj_to_delete')).toBeNull();
  });

  it('删除项目时应同时删除相关分镜', () => {
    const project = createTestProject({ id: 'proj_with_scenes' });
    saveProject(project);
    
    const scene: Scene = {
      id: 'scene_1',
      projectId: 'proj_with_scenes',
      order: 1,
      summary: 'Scene 1',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    saveScene('proj_with_scenes', scene);
    expect(getScenes('proj_with_scenes')).toHaveLength(1);
    
    deleteProject('proj_with_scenes');
    expect(getScenes('proj_with_scenes')).toHaveLength(0);
  });

  it('删除不存在的项目应不抛出异常', () => {
    expect(() => deleteProject('non-existent')).not.toThrow();
  });

  it('保存项目时应自动更新 updatedAt', () => {
    const originalDate = '2024-01-01T00:00:00.000Z';
    const project = createTestProject({ id: 'proj_1', updatedAt: originalDate });
    saveProject(project);
    
    // 第一次保存后检查（新项目）
    const saved1 = getProject('proj_1');
    expect(saved1?.updatedAt).toBe(originalDate); // 新建时保持原值
    
    // 更新项目
    const updated = { ...project, title: 'Updated Title' };
    saveProject(updated);
    
    const saved2 = getProject('proj_1');
    expect(saved2?.updatedAt).not.toBe(originalDate);
  });

  it('项目数据损坏时应返回空数组', () => {
    localStorage.setItem('aixs_projects', 'invalid-json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(getProjects()).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('应处理包含所有工作流状态的项目', () => {
    const states: Project['workflowState'][] = [
      'IDLE',
      'DATA_COLLECTING',
      'DATA_COLLECTED',
      'SCENE_LIST_GENERATING',
      'SCENE_LIST_EDITING',
      'SCENE_LIST_CONFIRMED',
      'SCENE_PROCESSING',
      'ALL_SCENES_COMPLETE',
      'EXPORTING',
    ];
    
    states.forEach((state, index) => {
      const project = createTestProject({ id: `proj_${index}`, workflowState: state });
      saveProject(project);
      expect(getProject(`proj_${index}`)?.workflowState).toBe(state);
    });
  });
});

// ==========================================
// 分镜操作测试
// ==========================================

describe('分镜操作', () => {
  const createTestScene = (overrides: Partial<Scene> = {}): Scene => ({
    id: `scene_${Date.now()}`,
    projectId: 'proj_1',
    order: 1,
    summary: 'Test scene',
    sceneDescription: 'Description',
    actionDescription: 'Action',
    shotPrompt: 'Prompt',
    status: 'pending',
    notes: 'Notes',
    ...overrides,
  });

  it('应当保存并读取分镜数据', () => {
    const scene = createTestScene({ id: 'scene_1', projectId: 'proj_1' });
    saveScene('proj_1', scene);
    expect(getScenes('proj_1')).toEqual([scene]);
  });

  it('应处理空分镜列表', () => {
    expect(getScenes('non-existent-project')).toEqual([]);
  });

  it('应更新已存在的分镜', () => {
    const scene = createTestScene({ id: 'scene_1', summary: 'Original' });
    saveScene('proj_1', scene);
    
    const updated = { ...scene, summary: 'Updated' };
    saveScene('proj_1', updated);
    
    expect(getScenes('proj_1')).toHaveLength(1);
    expect(getScene('proj_1', 'scene_1')?.summary).toBe('Updated');
  });

  it('应保存多个分镜', () => {
    for (let i = 1; i <= 10; i++) {
      saveScene('proj_1', createTestScene({ id: `scene_${i}`, order: i }));
    }
    
    expect(getScenes('proj_1')).toHaveLength(10);
  });

  it('应批量保存分镜', () => {
    const scenes = [
      createTestScene({ id: 'scene_1', order: 1 }),
      createTestScene({ id: 'scene_2', order: 2 }),
      createTestScene({ id: 'scene_3', order: 3 }),
    ];
    
    saveScenes('proj_1', scenes);
    expect(getScenes('proj_1')).toHaveLength(3);
  });

  it('批量保存应覆盖已有分镜', () => {
    const oldScene = createTestScene({ id: 'scene_old' });
    saveScene('proj_1', oldScene);
    expect(getScenes('proj_1')).toHaveLength(1);
    
    const newScenes = [
      createTestScene({ id: 'scene_new_1', order: 1 }),
      createTestScene({ id: 'scene_new_2', order: 2 }),
    ];
    saveScenes('proj_1', newScenes);
    
    expect(getScenes('proj_1')).toHaveLength(2);
    expect(getScene('proj_1', 'scene_old')).toBeNull();
  });

  it('应正确获取单个分镜', () => {
    const scene = createTestScene({ id: 'scene_target' });
    saveScene('proj_1', scene);
    
    expect(getScene('proj_1', 'scene_target')).toEqual(scene);
    expect(getScene('proj_1', 'non-existent')).toBeNull();
  });

  it('不同项目的分镜应相互独立', () => {
    saveScene('proj_1', createTestScene({ id: 'scene_1', projectId: 'proj_1' }));
    saveScene('proj_2', createTestScene({ id: 'scene_2', projectId: 'proj_2' }));
    
    expect(getScenes('proj_1')).toHaveLength(1);
    expect(getScenes('proj_2')).toHaveLength(1);
    expect(getScene('proj_1', 'scene_1')).not.toBeNull();
    expect(getScene('proj_1', 'scene_2')).toBeNull();
  });

  it('分镜数据损坏时应返回空数组', () => {
    localStorage.setItem('aixs_scenes_proj_1', 'invalid-json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(getScenes('proj_1')).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('应处理所有分镜状态', () => {
    const statuses: Scene['status'][] = [
      'pending',
      'scene_generating',
      'scene_confirmed',
      'action_generating',
      'action_confirmed',
      'prompt_generating',
      'completed',
      'needs_update',
    ];
    
    statuses.forEach((status, index) => {
      const scene = createTestScene({ id: `scene_${index}`, status });
      saveScene('proj_1', scene);
    });
    
    expect(getScenes('proj_1')).toHaveLength(statuses.length);
  });

  it('应处理包含上下文摘要的分镜', () => {
    const scene = createTestScene({
      id: 'scene_with_context',
      contextSummary: {
        mood: 'tense',
        keyElement: 'sword',
        transition: 'fade',
      },
    });
    
    saveScene('proj_1', scene);
    const retrieved = getScene('proj_1', 'scene_with_context');
    
    expect(retrieved?.contextSummary?.mood).toBe('tense');
    expect(retrieved?.contextSummary?.keyElement).toBe('sword');
    expect(retrieved?.contextSummary?.transition).toBe('fade');
  });
});

// ==========================================
// 数据导入导出测试
// ==========================================

describe('数据导入导出', () => {
  it('应正确导出空数据', () => {
    const exported = exportData();
    const parsed = JSON.parse(exported);
    
    expect(parsed.version).toBe('1.2.0');
    expect(parsed.projects).toEqual([]);
    expect(parsed.scenes).toEqual({});
    expect(parsed.exportedAt).toBeDefined();
  });

  it('应正确导出项目和分镜', () => {
    const project: Project = {
      id: 'proj_1',
      title: 'Export Test',
      summary: 'summary',
      style: 'ink',
      protagonist: 'hero',
      workflowState: 'DATA_COLLECTING',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    
    const scene: Scene = {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: 'Scene 1',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    saveScene('proj_1', scene);
    
    const exported = exportData();
    const parsed = JSON.parse(exported);
    
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].id).toBe('proj_1');
    expect(parsed.scenes['proj_1']).toHaveLength(1);
    expect(parsed.scenes['proj_1'][0].id).toBe('scene_1');
  });

  it('应正确导入数据', () => {
    const dataToImport = JSON.stringify({
      version: '1.1.0',
      projects: [
        {
          id: 'imported_proj',
          title: 'Imported Project',
          summary: 'summary',
          style: 'ink',
          protagonist: 'hero',
          workflowState: 'DATA_COLLECTING',
          currentSceneOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      scenes: {
        'imported_proj': [
          {
            id: 'imported_scene',
            projectId: 'imported_proj',
            order: 1,
            summary: 'Imported Scene',
            sceneDescription: '',
            actionDescription: '',
            shotPrompt: '',
            status: 'pending',
            notes: '',
          },
        ],
      },
    });
    
    importData(dataToImport);
    
    expect(getProjects()).toHaveLength(1);
    expect(getProject('imported_proj')?.title).toBe('Imported Project');
    expect(getScenes('imported_proj')).toHaveLength(1);
  });

  it('导入无效数据应抛出错误', () => {
    expect(() => importData('invalid-json')).toThrow('数据导入失败');
  });

  it('导入空对象应不影响现有数据', () => {
    const project: Project = {
      id: 'existing_proj',
      title: 'Existing',
      summary: '',
      style: '',
      protagonist: '',
      workflowState: 'IDLE',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    
    importData('{}');
    
    // 由于 importData 会覆盖，检查行为
    expect(getProjects()).toHaveLength(1);
  });

  it('导出后再导入应保持数据一致', () => {
    // 创建测试数据
    const project: Project = {
      id: 'round_trip_proj',
      title: 'Round Trip Test',
      summary: 'summary',
      style: 'ink',
      protagonist: 'hero',
      workflowState: 'SCENE_PROCESSING',
      currentSceneOrder: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    saveProject(project);
    
    const scenes: Scene[] = [
      {
        id: 'scene_1',
        projectId: 'round_trip_proj',
        order: 1,
        summary: 'Scene 1',
        sceneDescription: 'Desc 1',
        actionDescription: 'Action 1',
        shotPrompt: 'Prompt 1',
        status: 'completed',
        notes: 'Notes 1',
      },
      {
        id: 'scene_2',
        projectId: 'round_trip_proj',
        order: 2,
        summary: 'Scene 2',
        sceneDescription: 'Desc 2',
        actionDescription: 'Action 2',
        shotPrompt: 'Prompt 2',
        status: 'pending',
        notes: 'Notes 2',
      },
    ];
    saveScenes('round_trip_proj', scenes);
    
    // 导出
    const exported = exportData();
    
    // 清除数据
    clearAllData();
    expect(getProjects()).toHaveLength(0);
    expect(getScenes('round_trip_proj')).toHaveLength(0);
    
    // 导入
    importData(exported);
    
    // 验证
    const importedProject = getProject('round_trip_proj');
    expect(importedProject?.title).toBe('Round Trip Test');
    expect(importedProject?.workflowState).toBe('SCENE_PROCESSING');
    
    const importedScenes = getScenes('round_trip_proj');
    expect(importedScenes).toHaveLength(2);
    expect(importedScenes[0].summary).toBe('Scene 1');
    expect(importedScenes[1].summary).toBe('Scene 2');
  });
});

// ==========================================
// 清理与维护测试
// ==========================================

describe('清理与维护', () => {
  it('clearAllData 应清除所有 aixs 前缀的数据', () => {
    // 添加测试数据
    saveConfig({ provider: 'deepseek', apiKey: 'key', model: 'model' });
    saveProject({
      id: 'proj_1',
      title: 'Test',
      summary: '',
      style: '',
      protagonist: '',
      workflowState: 'IDLE',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    saveScene('proj_1', {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: '',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    });
    
    // 添加非 aixs 前缀的数据
    localStorage.setItem('other_key', 'other_value');
    
    clearAllData();
    
    // aixs 数据应被清除
    expect(getConfig()).toBeNull();
    expect(getProjects()).toHaveLength(0);
    expect(getScenes('proj_1')).toHaveLength(0);
    
    // 版本号应保留
    expect(localStorage.getItem('aixs_version')).toBe('1.2.0');
    
    // 非 aixs 数据应保留
    expect(localStorage.getItem('other_key')).toBe('other_value');
  });

  it('getStorageUsage 应返回正确的存储使用情况', () => {
    const usage1 = getStorageUsage();
    expect(usage1.used).toBe(0);
    expect(usage1.total).toBe(5 * 1024 * 1024);
    
    // 添加一些数据
    saveConfig({ provider: 'deepseek', apiKey: 'test-key-12345', model: 'model' });
    
    const usage2 = getStorageUsage();
    expect(usage2.used).toBeGreaterThan(0);
  });

  it('getStorageUsage 应只计算 aixs 前缀的数据', () => {
    localStorage.setItem('other_key', 'x'.repeat(1000));
    
    const usage = getStorageUsage();
    expect(usage.used).toBe(0);
    
    localStorage.setItem('aixs_test', 'x'.repeat(100));
    const usage2 = getStorageUsage();
    expect(usage2.used).toBe(100);
  });
});

// ==========================================
// 边界情况测试
// ==========================================

describe('边界情况', () => {
  it('应处理项目 ID 包含特殊字符', () => {
    const projectId = 'proj_special-chars_123';
    const scene: Scene = {
      id: 'scene_1',
      projectId,
      order: 1,
      summary: 'Test',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene(projectId, scene);
    expect(getScenes(projectId)).toHaveLength(1);
  });

  it('应处理超长项目标题', () => {
    const longTitle = 'a'.repeat(10000);
    const project: Project = {
      id: 'proj_long_title',
      title: longTitle,
      summary: '',
      style: '',
      protagonist: '',
      workflowState: 'IDLE',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    saveProject(project);
    expect(getProject('proj_long_title')?.title).toBe(longTitle);
  });

  it('应处理空项目标题', () => {
    const project: Project = {
      id: 'proj_empty_title',
      title: '',
      summary: '',
      style: '',
      protagonist: '',
      workflowState: 'IDLE',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    saveProject(project);
    expect(getProject('proj_empty_title')?.title).toBe('');
  });

  it('应处理分镜顺序为 0', () => {
    const scene: Scene = {
      id: 'scene_order_0',
      projectId: 'proj_1',
      order: 0,
      summary: 'Test',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    expect(getScene('proj_1', 'scene_order_0')?.order).toBe(0);
  });

  it('应处理分镜顺序为负数', () => {
    const scene: Scene = {
      id: 'scene_negative_order',
      projectId: 'proj_1',
      order: -1,
      summary: 'Test',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    expect(getScene('proj_1', 'scene_negative_order')?.order).toBe(-1);
  });

  it('应处理分镜顺序为浮点数', () => {
    const scene: Scene = {
      id: 'scene_float_order',
      projectId: 'proj_1',
      order: 1.5,
      summary: 'Test',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    expect(getScene('proj_1', 'scene_float_order')?.order).toBe(1.5);
  });

  it('应处理包含换行符的数据', () => {
    const scene: Scene = {
      id: 'scene_newlines',
      projectId: 'proj_1',
      order: 1,
      summary: 'Line 1\nLine 2\nLine 3',
      sceneDescription: 'Desc\n\nWith\n\nNewlines',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    const retrieved = getScene('proj_1', 'scene_newlines');
    expect(retrieved?.summary).toContain('\n');
  });

  it('应处理包含 HTML 标签的数据', () => {
    const scene: Scene = {
      id: 'scene_html',
      projectId: 'proj_1',
      order: 1,
      summary: '<script>alert("xss")</script>',
      sceneDescription: '<div onclick="hack()">Click</div>',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    const retrieved = getScene('proj_1', 'scene_html');
    expect(retrieved?.summary).toContain('<script>');
  });

  it('应处理 JSON 特殊字符', () => {
    const scene: Scene = {
      id: 'scene_json_chars',
      projectId: 'proj_1',
      order: 1,
      summary: '{"key": "value", "array": [1, 2, 3]}',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    const retrieved = getScene('proj_1', 'scene_json_chars');
    expect(retrieved?.summary).toContain('"key"');
  });

  it('应处理 Unicode 字符', () => {
    const scene: Scene = {
      id: 'scene_unicode',
      projectId: 'proj_1',
      order: 1,
      summary: '你好世界 🌍 مرحبا العالم こんにちは世界',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };
    
    saveScene('proj_1', scene);
    const retrieved = getScene('proj_1', 'scene_unicode');
    expect(retrieved?.summary).toContain('🌍');
    expect(retrieved?.summary).toContain('مرحبا');
  });
});

// ==========================================
// 密钥迁移测试
// ==========================================

describe('密钥迁移功能', () => {
  it('初始化加密应设置自定义密码标志', () => {
    expect(hasCustomEncryptionPassword()).toBe(false);
    
    initializeEncryption('my-password');
    
    expect(hasCustomEncryptionPassword()).toBe(true);
  });

  it('配置迁移标志应正确工作', () => {
    expect(configNeedsMigration()).toBe(false);
    
    localStorage.setItem('aixs_config_needs_migration', 'true');
    expect(configNeedsMigration()).toBe(true);
    
    localStorage.removeItem('aixs_config_needs_migration');
    expect(configNeedsMigration()).toBe(false);
  });

  it('应能将遗留加密配置迁移到新密钥', () => {
    // 使用遗留密钥加密配置
    const config: UserConfig = {
      provider: 'deepseek',
      apiKey: 'test-api-key-12345',
      model: 'deepseek-chat',
    };
    
    // 未初始化时保存（使用遗留密钥）
    saveConfig(config);
    const legacyEncrypted = localStorage.getItem('aixs_config');
    expect(legacyEncrypted).toBeDefined();
    
    // 标记需要迁移
    localStorage.setItem('aixs_config_needs_migration', 'true');
    
    // 初始化加密（应自动迁移）
    initializeEncryption('new-secure-password');
    
    // 迁移标志应被清除
    expect(configNeedsMigration()).toBe(false);
    
    // 配置应能正确读取
    const retrieved = getConfig();
    expect(retrieved?.apiKey).toBe('test-api-key-12345');
  });

  it('更换密码应重新加密配置', () => {
    initializeEncryption('password-1');
    
    const config: UserConfig = {
      provider: 'gemini',
      apiKey: 'gemini-api-key',
      model: 'gemini-pro',
    };
    saveConfig(config);
    
    // 获取旧加密数据
    const oldEncrypted = localStorage.getItem('aixs_config');
    
    // 更换密码
    const result = changeEncryptionPassword('password-2');
    expect(result).toBe(true);
    
    // 加密数据应变化
    const newEncrypted = localStorage.getItem('aixs_config');
    expect(newEncrypted).not.toBe(oldEncrypted);
    
    // 配置应仍可读取
    const retrieved = getConfig();
    expect(retrieved?.apiKey).toBe('gemini-api-key');
  });

  it('未初始化时更换密码应失败', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const result = changeEncryptionPassword('new-password');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('未初始化时迁移配置应失败', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const result = migrateConfigToNewKey();
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('获取遗留密钥应返回正确值', () => {
    const legacyKey = getLegacyEncryptionKey();
    expect(legacyKey).toBe('aixs-manga-creator-secret-key-2024');
  });

  it('不同用途应使用不同密钥加密', () => {
    initializeEncryption('my-password');
    
    const data = 'same-data';
    const configEncrypted = encrypt(data, KeyPurpose.CONFIG);
    const projectEncrypted = encrypt(data, KeyPurpose.PROJECT);
    const sceneEncrypted = encrypt(data, KeyPurpose.SCENE);
    
    // 不同用途加密结果应不同
    expect(configEncrypted).not.toBe(projectEncrypted);
    expect(configEncrypted).not.toBe(sceneEncrypted);
    expect(projectEncrypted).not.toBe(sceneEncrypted);
    
    // 但都能正确解密
    expect(decrypt(configEncrypted, KeyPurpose.CONFIG)).toBe(data);
    expect(decrypt(projectEncrypted, KeyPurpose.PROJECT)).toBe(data);
    expect(decrypt(sceneEncrypted, KeyPurpose.SCENE)).toBe(data);
  });

  it('错误用途解密应失败', () => {
    initializeEncryption('my-password');
    
    const encrypted = encrypt('secret', KeyPurpose.CONFIG);
    const decrypted = decrypt(encrypted, KeyPurpose.PROJECT);
    
    expect(decrypted).toBe('');
  });
});
