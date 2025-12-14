import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Scene, UserConfig, UserConfigState } from '@/types';

// ==========================================
// Mock Storage State
// ==========================================

const storageState = {
  projects: [] as Project[],
  scenes: {} as Record<string, Scene[]>,
  configState: null as UserConfigState | null,
};

const storageSpies = {
  getProjects: vi.fn(() => storageState.projects),
  getProject: vi.fn(
    (projectId: string) => storageState.projects.find((p) => p.id === projectId) ?? null,
  ),
  saveProject: vi.fn((project: Project) => {
    const index = storageState.projects.findIndex((p) => p.id === project.id);
    if (index >= 0) {
      storageState.projects[index] = project;
    } else {
      storageState.projects.push(project);
    }
  }),
  deleteProject: vi.fn((projectId: string) => {
    storageState.projects = storageState.projects.filter((p) => p.id !== projectId);
    delete storageState.scenes[projectId];
  }),
  getScenes: vi.fn((projectId: string) => storageState.scenes[projectId] ?? []),
  saveScene: vi.fn((projectId: string, scene: Scene) => {
    const scenes = storageState.scenes[projectId] ?? [];
    const index = scenes.findIndex((s) => s.id === scene.id);
    if (index >= 0) {
      scenes[index] = scene;
    } else {
      scenes.push(scene);
    }
    storageState.scenes[projectId] = scenes;
  }),
  saveScenePatchBatched: vi.fn((projectId: string, sceneId: string, updates: Partial<Scene>) => {
    const scenes = storageState.scenes[projectId] ?? [];
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index >= 0) {
      scenes[index] = { ...scenes[index], ...updates };
      storageState.scenes[projectId] = scenes;
    }
  }),
  saveScenes: vi.fn((projectId: string, scenes: Scene[]) => {
    storageState.scenes[projectId] = [...scenes];
  }),
  getConfigState: vi.fn(() => storageState.configState),
  saveConfigState: vi.fn((state: UserConfigState) => {
    storageState.configState = state;
  }),
  clearConfig: vi.fn(() => {
    storageState.configState = null;
  }),
};

vi.mock('@/lib/storage', () => storageSpies);

// Mock AIFactory for configStore tests
vi.mock('@/lib/ai/factory', () => ({
  AIFactory: {
    createClient: vi.fn().mockReturnValue({
      chat: vi.fn().mockResolvedValue({ content: 'pong' }),
    }),
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

let useProjectStore: typeof import('@/stores/projectStore').useProjectStore;
let useStoryboardStore: typeof import('@/stores/storyboardStore').useStoryboardStore;
let useConfigStore: typeof import('@/stores/configStore').useConfigStore;

beforeEach(async () => {
  storageState.projects = [];
  storageState.scenes = {};
  storageState.configState = null;
  Object.values(storageSpies).forEach((spy) => {
    if ('mockClear' in spy) {
      spy.mockClear();
    }
  });

  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });

  vi.resetModules();
  ({ useProjectStore } = await import('@/stores/projectStore'));
  ({ useStoryboardStore } = await import('@/stores/storyboardStore'));
  ({ useConfigStore } = await import('@/stores/configStore'));
});

// ==========================================
// Project Store 测试
// ==========================================

describe('ProjectStore', () => {
  describe('createProject', () => {
    it('应写入 storage 并设置当前项目', () => {
      const projectData = {
        title: 'Test',
        summary: 'Summary',
        style: 'style',
        protagonist: 'hero',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      };

      const project = useProjectStore.getState().createProject(projectData);

      expect(storageSpies.saveProject).toHaveBeenCalled();
      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(useProjectStore.getState().currentProject?.id).toBe(project.id);
    });

    it('应生成唯一的项目 ID', () => {
      const project1 = useProjectStore.getState().createProject({
        title: 'Project 1',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      const project2 = useProjectStore.getState().createProject({
        title: 'Project 2',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(project1.id).not.toBe(project2.id);
      expect(project1.id).toMatch(/^proj_/);
      expect(project2.id).toMatch(/^proj_/);
    });

    it('应设置正确的初始工作流状态', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(project.workflowState).toBe('DATA_COLLECTING');
      expect(project.currentSceneOrder).toBe(0);
    });

    it('应设置创建时间和更新时间', () => {
      const before = new Date().toISOString();
      const project = useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });
      const after = new Date().toISOString();

      expect(project.createdAt >= before).toBe(true);
      expect(project.createdAt <= after).toBe(true);
      expect(project.updatedAt).toBe(project.createdAt);
    });
  });

  describe('updateProject', () => {
    it('应同步更新 storage 和状态', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Original',
        summary: 'Summary',
        style: 'style',
        protagonist: 'hero',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      useProjectStore.getState().updateProject(project.id, { title: 'Updated' });

      expect(storageSpies.saveProject).toHaveBeenCalledTimes(2);
      expect(useProjectStore.getState().projects[0].title).toBe('Updated');
    });

    it('应更新 updatedAt 时间戳', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });
      const originalUpdatedAt = project.updatedAt;

      useProjectStore.getState().updateProject(project.id, { title: 'Updated' });

      const updatedProject = useProjectStore.getState().projects[0];
      // updatedAt 应该大于等于原始时间戳
      expect(updatedProject.updatedAt >= originalUpdatedAt).toBe(true);
    });

    it('应同步更新 currentProject', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      useProjectStore.getState().updateProject(project.id, { title: 'Updated' });

      expect(useProjectStore.getState().currentProject?.title).toBe('Updated');
    });

    it('更新不存在的项目应无操作', () => {
      useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      const callCount = storageSpies.saveProject.mock.calls.length;
      useProjectStore.getState().updateProject('non-existent', { title: 'Updated' });

      expect(storageSpies.saveProject).toHaveBeenCalledTimes(callCount);
    });

    it('应能更新所有可变字段', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Test',
        summary: 'Summary',
        style: 'style',
        protagonist: 'hero',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      useProjectStore.getState().updateProject(project.id, {
        title: 'New Title',
        summary: 'New Summary',
        style: 'New Style',
        protagonist: 'New Hero',
        workflowState: 'SCENE_PROCESSING',
        currentSceneOrder: 5,
      });

      const updated = useProjectStore.getState().projects[0];
      expect(updated.title).toBe('New Title');
      expect(updated.summary).toBe('New Summary');
      expect(updated.style).toBe('New Style');
      expect(updated.protagonist).toBe('New Hero');
      expect(updated.workflowState).toBe('SCENE_PROCESSING');
      expect(updated.currentSceneOrder).toBe(5);
    });
  });

  describe('deleteProject', () => {
    it('应从 storage 和状态中删除项目', () => {
      const project = useProjectStore.getState().createProject({
        title: 'To Delete',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      useProjectStore.getState().deleteProject(project.id);

      expect(storageSpies.deleteProject).toHaveBeenCalledWith(project.id);
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });

    it('删除当前项目时应清除 currentProject', () => {
      const project = useProjectStore.getState().createProject({
        title: 'Current',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(useProjectStore.getState().currentProject).not.toBeNull();

      useProjectStore.getState().deleteProject(project.id);

      expect(useProjectStore.getState().currentProject).toBeNull();
    });

    it('删除其他项目时应保持 currentProject', () => {
      const project1 = useProjectStore.getState().createProject({
        title: 'Project 1',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      const project2 = useProjectStore.getState().createProject({
        title: 'Project 2',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      useProjectStore.getState().setCurrentProject(project2);
      useProjectStore.getState().deleteProject(project1.id);

      expect(useProjectStore.getState().currentProject?.id).toBe(project2.id);
    });
  });

  describe('loadProjects', () => {
    it('应从 storage 加载项目列表', () => {
      storageState.projects = [
        {
          id: 'proj_1',
          title: 'Loaded Project',
          summary: '',
          style: '',
          protagonist: '',
          workflowState: 'IDLE',
          currentSceneOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      useProjectStore.getState().loadProjects();

      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(useProjectStore.getState().projects[0].title).toBe('Loaded Project');
    });

    it('加载时应设置 isLoading 状态', () => {
      useProjectStore.getState().loadProjects();

      expect(useProjectStore.getState().isLoading).toBe(false);
    });
  });

  describe('loadProject', () => {
    it('应加载并设置当前项目', () => {
      storageState.projects = [
        {
          id: 'proj_1',
          title: 'Target Project',
          summary: '',
          style: '',
          protagonist: '',
          workflowState: 'IDLE',
          currentSceneOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      useProjectStore.getState().loadProject('proj_1');

      expect(useProjectStore.getState().currentProject?.title).toBe('Target Project');
    });

    it('加载不存在的项目应不改变状态', () => {
      useProjectStore.getState().loadProject('non-existent');

      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });

  describe('setCurrentProject', () => {
    it('应设置当前项目', () => {
      const project: Project = {
        id: 'proj_1',
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'IDLE',
        currentSceneOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      useProjectStore.getState().setCurrentProject(project);

      expect(useProjectStore.getState().currentProject).toEqual(project);
    });

    it('应能设置为 null', () => {
      useProjectStore.getState().createProject({
        title: 'Test',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(useProjectStore.getState().currentProject).not.toBeNull();

      useProjectStore.getState().setCurrentProject(null);

      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });
});

// ==========================================
// Storyboard Store 测试
// ==========================================

describe('StoryboardStore', () => {
  describe('addScene', () => {
    it('应生成 ID 并按顺序追加', () => {
      const projectId = 'proj_1';
      const scene = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Summary',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      expect(scene.id).toMatch(/scene_/);
      expect(storageSpies.saveScene).toHaveBeenCalled();
      expect(useStoryboardStore.getState().scenes).toHaveLength(1);
    });

    it('应自动设置 order 为下一个序号', () => {
      const projectId = 'proj_1';

      const scene1 = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Scene 1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      const scene2 = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 2,
        summary: 'Scene 2',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      expect(scene1.order).toBe(1);
      expect(scene2.order).toBe(2);
    });

    it('应将状态设置为 pending', () => {
      const projectId = 'proj_1';
      const scene = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'completed', // 即使传入其他状态
      });

      expect(scene.status).toBe('pending');
    });
  });

  describe('setScenes', () => {
    it('应重新编号并持久化', () => {
      const projectId = 'proj_1';
      const scenes: Scene[] = [
        {
          id: 'scene_a',
          projectId,
          order: 5,
          summary: 'A',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          notes: '',
          status: 'pending',
        },
        {
          id: 'scene_b',
          projectId,
          order: 10,
          summary: 'B',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          notes: '',
          status: 'pending',
        },
      ];

      useStoryboardStore.getState().setScenes(projectId, scenes);

      expect(storageSpies.saveScenes).toHaveBeenCalledWith(projectId, expect.any(Array));
      expect(useStoryboardStore.getState().scenes[0].order).toBe(1);
      expect(useStoryboardStore.getState().scenes[1].order).toBe(2);
    });

    it('应覆盖现有分镜', () => {
      const projectId = 'proj_1';

      // 添加初始分镜
      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Old Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      // 设置新分镜
      const newScenes: Scene[] = [
        {
          id: 'new_scene',
          projectId,
          order: 1,
          summary: 'New Scene',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          notes: '',
          status: 'pending',
        },
      ];

      useStoryboardStore.getState().setScenes(projectId, newScenes);

      expect(useStoryboardStore.getState().scenes).toHaveLength(1);
      expect(useStoryboardStore.getState().scenes[0].summary).toBe('New Scene');
    });
  });

  describe('updateScene', () => {
    it('应更新分镜并持久化', () => {
      const projectId = 'proj_1';
      const scene = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Original',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().updateScene(projectId, scene.id, { summary: 'Updated' });

      expect(useStoryboardStore.getState().scenes[0].summary).toBe('Updated');
      expect(storageSpies.saveScene).toHaveBeenCalledTimes(1);
      expect(storageSpies.saveScenePatchBatched).toHaveBeenCalledTimes(1);
    });

    it('更新不存在的分镜应无操作', () => {
      const projectId = 'proj_1';
      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      const callCount = storageSpies.saveScenePatchBatched.mock.calls.length;
      useStoryboardStore.getState().updateScene(projectId, 'non-existent', { summary: 'Updated' });

      expect(storageSpies.saveScenePatchBatched).toHaveBeenCalledTimes(callCount);
    });

    it('应能更新所有字段', () => {
      const projectId = 'proj_1';
      const scene = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Original',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().updateScene(projectId, scene.id, {
        summary: 'New Summary',
        sceneDescription: 'New Scene Desc',
        actionDescription: 'New Action Desc',
        shotPrompt: 'New Prompt',
        notes: 'New Notes',
        status: 'completed',
      });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.summary).toBe('New Summary');
      expect(updated.sceneDescription).toBe('New Scene Desc');
      expect(updated.actionDescription).toBe('New Action Desc');
      expect(updated.shotPrompt).toBe('New Prompt');
      expect(updated.notes).toBe('New Notes');
      expect(updated.status).toBe('completed');
    });
  });

  describe('deleteScene', () => {
    it('应删除分镜并重新编号', () => {
      const projectId = 'proj_1';

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Scene 1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      const scene2 = useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 2,
        summary: 'Scene 2',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 3,
        summary: 'Scene 3',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().deleteScene(projectId, scene2.id);

      expect(useStoryboardStore.getState().scenes).toHaveLength(2);
      expect(useStoryboardStore.getState().scenes[0].order).toBe(1);
      expect(useStoryboardStore.getState().scenes[1].order).toBe(2);
      expect(useStoryboardStore.getState().scenes[1].summary).toBe('Scene 3');
    });
  });

  describe('reorderScenes', () => {
    it('应重新排序分镜', () => {
      const projectId = 'proj_1';

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Scene A',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 2,
        summary: 'Scene B',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 3,
        summary: 'Scene C',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      // 将第一个移动到最后
      useStoryboardStore.getState().reorderScenes(projectId, 0, 2);

      const scenes = useStoryboardStore.getState().scenes;
      expect(scenes[0].summary).toBe('Scene B');
      expect(scenes[1].summary).toBe('Scene C');
      expect(scenes[2].summary).toBe('Scene A');
      expect(scenes[0].order).toBe(1);
      expect(scenes[1].order).toBe(2);
      expect(scenes[2].order).toBe(3);
    });
  });

  describe('loadScenes', () => {
    it('应从 storage 加载分镜', () => {
      const projectId = 'proj_1';
      storageState.scenes[projectId] = [
        {
          id: 'scene_1',
          projectId,
          order: 1,
          summary: 'Loaded Scene',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          notes: '',
          status: 'pending',
        },
      ];

      useStoryboardStore.getState().loadScenes(projectId);

      expect(useStoryboardStore.getState().scenes).toHaveLength(1);
      expect(useStoryboardStore.getState().scenes[0].summary).toBe('Loaded Scene');
    });
  });

  describe('setCurrentScene', () => {
    it('应设置当前分镜 ID', () => {
      useStoryboardStore.getState().setCurrentScene('scene_1');

      expect(useStoryboardStore.getState().currentSceneId).toBe('scene_1');
    });

    it('应能设置为 null', () => {
      useStoryboardStore.getState().setCurrentScene('scene_1');
      useStoryboardStore.getState().setCurrentScene(null);

      expect(useStoryboardStore.getState().currentSceneId).toBeNull();
    });
  });

  describe('setGenerating', () => {
    it('应设置 isGenerating 状态', () => {
      expect(useStoryboardStore.getState().isGenerating).toBe(false);

      useStoryboardStore.getState().setGenerating(true);
      expect(useStoryboardStore.getState().isGenerating).toBe(true);

      useStoryboardStore.getState().setGenerating(false);
      expect(useStoryboardStore.getState().isGenerating).toBe(false);
    });
  });
});

// ==========================================
// Config Store 测试
// ==========================================

describe('ConfigStore', () => {
  describe('loadConfig', () => {
    it('应从 storage 加载配置', () => {
      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat',
      };
      const now = new Date().toISOString();
      storageState.configState = {
        version: 1,
        activeProfileId: 'p1',
        profiles: [
          {
            id: 'p1',
            name: '默认档案',
            config,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      useConfigStore.getState().loadConfig();

      expect(useConfigStore.getState().config).toEqual(config);
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });

    it('无配置时应设置 isConfigured 为 false', () => {
      storageState.configState = null;

      useConfigStore.getState().loadConfig();

      expect(useConfigStore.getState().config).toBeNull();
      expect(useConfigStore.getState().isConfigured).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('应保存配置并更新状态', () => {
      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'new-key',
        model: 'deepseek-chat',
      };

      useConfigStore.getState().saveConfig(config);

      expect(storageSpies.saveConfigState).toHaveBeenCalled();
      expect(useConfigStore.getState().config).toEqual(config);
      expect(useConfigStore.getState().isConfigured).toBe(true);
    });
  });

  describe('clearConfig', () => {
    it('应清除配置并更新状态', () => {
      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'key',
        model: 'model',
      };
      useConfigStore.getState().saveConfig(config);
      expect(useConfigStore.getState().isConfigured).toBe(true);

      useConfigStore.getState().clearConfig();

      expect(storageSpies.clearConfig).toHaveBeenCalled();
      expect(useConfigStore.getState().config).toBeNull();
      expect(useConfigStore.getState().isConfigured).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('连接成功时应返回 true', async () => {
      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'valid-key',
        model: 'deepseek-chat',
      };

      const result = await useConfigStore.getState().testConnection(config);

      expect(result).toBe(true);
    });

    it('连接失败时应返回 false', async () => {
      // 重新 mock AIFactory 抛出错误
      const { AIFactory } = await import('@/lib/ai/factory');
      vi.mocked(AIFactory.createClient).mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });

      const config: UserConfig = {
        provider: 'deepseek',
        apiKey: 'invalid-key',
        model: 'deepseek-chat',
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await useConfigStore.getState().testConnection(config);

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});

// ==========================================
// 边界情况测试
// ==========================================

describe('边界情况', () => {
  describe('ProjectStore 边界情况', () => {
    it('应处理空标题', () => {
      const project = useProjectStore.getState().createProject({
        title: '',
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(project.title).toBe('');
    });

    it('应处理超长标题', () => {
      const longTitle = 'a'.repeat(10000);
      const project = useProjectStore.getState().createProject({
        title: longTitle,
        summary: '',
        style: '',
        protagonist: '',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(project.title).toBe(longTitle);
    });

    it('应处理包含特殊字符的内容', () => {
      const project = useProjectStore.getState().createProject({
        title: '<script>alert("xss")</script>',
        summary: '\n\t\r',
        style: '中文',
        protagonist: '😀',
        workflowState: 'DATA_COLLECTING' as const,
        currentSceneOrder: 0,
      });

      expect(project.title).toContain('script');
      expect(project.protagonist).toBe('😀');
    });
  });

  describe('StoryboardStore 边界情况', () => {
    it('应处理空分镜列表', () => {
      useStoryboardStore.getState().setScenes('proj_1', []);

      expect(useStoryboardStore.getState().scenes).toHaveLength(0);
    });

    it('应处理大量分镜', () => {
      const projectId = 'proj_1';
      const scenes: Scene[] = [];

      for (let i = 0; i < 100; i++) {
        scenes.push({
          id: `scene_${i}`,
          projectId,
          order: i + 1,
          summary: `Scene ${i}`,
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          notes: '',
          status: 'pending',
        });
      }

      useStoryboardStore.getState().setScenes(projectId, scenes);

      expect(useStoryboardStore.getState().scenes).toHaveLength(100);
      expect(useStoryboardStore.getState().scenes[99].order).toBe(100);
    });

    it('应处理重新排序的边界情况', () => {
      const projectId = 'proj_1';

      useStoryboardStore.getState().addScene(projectId, {
        projectId,
        order: 1,
        summary: 'Only Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        notes: '',
        status: 'pending',
      });

      // 将唯一的分镜移动到同一位置
      useStoryboardStore.getState().reorderScenes(projectId, 0, 0);

      expect(useStoryboardStore.getState().scenes).toHaveLength(1);
      expect(useStoryboardStore.getState().scenes[0].order).toBe(1);
    });
  });
});
