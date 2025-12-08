import { beforeEach, describe, expect, it } from 'vitest';
import { saveConfig, getConfig, saveProject, getProjects, getProject, saveScene, getScenes } from '@/lib/storage';
import { Project, Scene, UserConfig } from '@/types';

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};

  return {
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
  } as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });
});

describe('storage helpers', () => {
  it('应正确保存并读取加密配置', () => {
    const config: UserConfig = {
      provider: 'deepseek',
      apiKey: 'secret',
      model: 'deepseek-chat',
    };

    saveConfig(config);
    expect(getConfig()).toEqual(config);
  });

  it('应当保存并获取项目列表', () => {
    const project: Project = {
      id: 'proj_1',
      title: 'Demo',
      summary: 'summary',
      style: 'ink',
      protagonist: 'hero',
      workflowState: 'DATA_COLLECTING',
      currentSceneOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveProject(project);
    expect(getProjects()).toHaveLength(1);
    expect(getProject(project.id)?.title).toBe('Demo');
  });

  it('应当保存并读取分镜数据', () => {
    const scene: Scene = {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: 'summary',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      status: 'pending',
      notes: '',
    };

    saveScene(scene.projectId, scene);
    expect(getScenes(scene.projectId)).toEqual([scene]);
  });
});
