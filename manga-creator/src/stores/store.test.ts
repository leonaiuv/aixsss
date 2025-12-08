import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Scene } from '@/types';

const storageState = {
  projects: [] as Project[],
  scenes: {} as Record<string, Scene[]>,
};

const storageSpies = {
  getProjects: vi.fn(() => storageState.projects),
  getProject: vi.fn((projectId: string) => storageState.projects.find((p) => p.id === projectId) ?? null),
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
  saveScenes: vi.fn((projectId: string, scenes: Scene[]) => {
    storageState.scenes[projectId] = [...scenes];
  }),
};

vi.mock('@/lib/storage', () => storageSpies);

let useProjectStore: typeof import('@/stores/projectStore').useProjectStore;
let useStoryboardStore: typeof import('@/stores/storyboardStore').useStoryboardStore;

beforeEach(async () => {
  storageState.projects = [];
  storageState.scenes = {};
  Object.values(storageSpies).forEach((spy) => {
    if ('mockClear' in spy) {
      spy.mockClear();
    }
  });
  vi.resetModules();
  ({ useProjectStore } = await import('@/stores/projectStore'));
  ({ useStoryboardStore } = await import('@/stores/storyboardStore'));
});

describe('project store', () => {
  it('createProject 应写入 storage 并设置当前项目', () => {
    const projectData = {
      title: 'Test',
      summary: 'Summary',
      style: 'style',
      protagonist: 'hero',
    };

    const project = useProjectStore.getState().createProject(projectData);

    expect(storageSpies.saveProject).toHaveBeenCalled();
    expect(useProjectStore.getState().projects).toHaveLength(1);
    expect(useProjectStore.getState().currentProject?.id).toBe(project.id);
  });

  it('updateProject 应同步更新 storage 和状态', () => {
    const project = useProjectStore.getState().createProject({
      title: 'Original',
      summary: 'Summary',
      style: 'style',
      protagonist: 'hero',
    });

    useProjectStore.getState().updateProject(project.id, { title: 'Updated' });

    expect(storageSpies.saveProject).toHaveBeenCalledTimes(2);
    expect(useProjectStore.getState().projects[0].title).toBe('Updated');
  });
});

describe('storyboard store', () => {
  it('addScene 应生成 ID 并按顺序追加', () => {
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

  it('setScenes 应重新编号并持久化', () => {
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
});
