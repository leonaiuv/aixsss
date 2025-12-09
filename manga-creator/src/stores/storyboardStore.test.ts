import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStoryboardStore } from './storyboardStore';
import * as storage from '@/lib/storage';
import { Scene } from '@/types';

// Mock storage functions
vi.mock('@/lib/storage', () => ({
  getScenes: vi.fn(() => []),
  saveScene: vi.fn(),
  saveScenes: vi.fn(),
}));

describe('storyboardStore', () => {
  beforeEach(() => {
    useStoryboardStore.setState({
      scenes: [],
      currentSceneId: null,
      isGenerating: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty scenes array', () => {
      const state = useStoryboardStore.getState();
      expect(state.scenes).toEqual([]);
    });

    it('should have null currentSceneId', () => {
      const state = useStoryboardStore.getState();
      expect(state.currentSceneId).toBeNull();
    });

    it('should have isGenerating as false', () => {
      const state = useStoryboardStore.getState();
      expect(state.isGenerating).toBe(false);
    });
  });

  describe('loadScenes', () => {
    it('should load scenes from storage', () => {
      const mockScenes: Scene[] = [
        {
          id: 'scene_1',
          projectId: 'proj_1',
          order: 1,
          summary: 'Scene 1',
          sceneDescription: 'Desc 1',
          actionDescription: 'Action 1',
          shotPrompt: 'Prompt 1',
          motionPrompt: 'Motion 1',
          status: 'pending',
          notes: '',
        },
      ];
      vi.mocked(storage.getScenes).mockReturnValue(mockScenes);

      const { loadScenes } = useStoryboardStore.getState();
      loadScenes('proj_1');

      expect(useStoryboardStore.getState().scenes).toEqual(mockScenes);
    });

    it('should call getScenes with correct projectId', () => {
      const { loadScenes } = useStoryboardStore.getState();
      loadScenes('proj_1');

      expect(storage.getScenes).toHaveBeenCalledWith('proj_1');
    });
  });

  describe('setScenes', () => {
    it('should set scenes and reorder', () => {
      const scenes: Scene[] = [
        {
          id: 'scene_1',
          projectId: 'proj_1',
          order: 5,
          summary: 'Scene 1',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        },
        {
          id: 'scene_2',
          projectId: 'proj_1',
          order: 3,
          summary: 'Scene 2',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        },
      ];

      const { setScenes } = useStoryboardStore.getState();
      setScenes('proj_1', scenes);

      const result = useStoryboardStore.getState().scenes;
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
    });

    it('should save scenes to storage', () => {
      const { setScenes } = useStoryboardStore.getState();
      setScenes('proj_1', []);

      expect(storage.saveScenes).toHaveBeenCalled();
    });
  });

  describe('addScene', () => {
    it('should add a new scene with generated ID', () => {
      const sceneData = {
        projectId: 'proj_1',
        order: 1,
        summary: 'New Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending' as const,
        notes: '',
      };

      const { addScene } = useStoryboardStore.getState();
      const newScene = addScene('proj_1', sceneData);

      expect(newScene.id).toMatch(/^scene_/);
      expect(newScene.summary).toBe('New Scene');
    });

    it('should set order based on existing scenes count', () => {
      const existingScene: Scene = {
        id: 'scene_1',
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene 1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      };
      useStoryboardStore.setState({ scenes: [existingScene] });

      const { addScene } = useStoryboardStore.getState();
      const newScene = addScene('proj_1', {
        projectId: 'proj_1',
        order: 0,
        summary: 'Scene 2',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      });

      expect(newScene.order).toBe(2);
    });

    it('should save scene to storage', () => {
      const { addScene } = useStoryboardStore.getState();
      addScene('proj_1', {
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      });

      expect(storage.saveScene).toHaveBeenCalled();
    });

    it('should set status to pending', () => {
      const { addScene } = useStoryboardStore.getState();
      const newScene = addScene('proj_1', {
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'completed',
        notes: '',
      });

      expect(newScene.status).toBe('pending');
    });
  });

  describe('updateScene', () => {
    const existingScene: Scene = {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: 'Original',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
    };

    beforeEach(() => {
      useStoryboardStore.setState({ scenes: [existingScene] });
    });

    it('should update scene properties', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { summary: 'Updated' });

      const updated = useStoryboardStore.getState().scenes.find(s => s.id === 'scene_1');
      expect(updated?.summary).toBe('Updated');
    });

    it('should save updated scene to storage', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { summary: 'Updated' });

      expect(storage.saveScene).toHaveBeenCalled();
    });

    it('should not update if scene not found', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'nonexistent', { summary: 'Updated' });

      expect(storage.saveScene).not.toHaveBeenCalled();
    });

    it('should update status', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { status: 'completed' });

      const updated = useStoryboardStore.getState().scenes.find(s => s.id === 'scene_1');
      expect(updated?.status).toBe('completed');
    });
  });

  describe('deleteScene', () => {
    const scenes: Scene[] = [
      {
        id: 'scene_1',
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene 1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      },
      {
        id: 'scene_2',
        projectId: 'proj_1',
        order: 2,
        summary: 'Scene 2',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      },
    ];

    beforeEach(() => {
      useStoryboardStore.setState({ scenes });
    });

    it('should remove scene from scenes array', () => {
      const { deleteScene } = useStoryboardStore.getState();
      deleteScene('proj_1', 'scene_1');

      expect(useStoryboardStore.getState().scenes).toHaveLength(1);
    });

    it('should reorder remaining scenes', () => {
      const { deleteScene } = useStoryboardStore.getState();
      deleteScene('proj_1', 'scene_1');

      const remaining = useStoryboardStore.getState().scenes;
      expect(remaining[0].order).toBe(1);
    });

    it('should save updated scenes to storage', () => {
      const { deleteScene } = useStoryboardStore.getState();
      deleteScene('proj_1', 'scene_1');

      expect(storage.saveScenes).toHaveBeenCalled();
    });
  });

  describe('reorderScenes', () => {
    const scenes: Scene[] = [
      { id: 'scene_1', projectId: 'proj_1', order: 1, summary: 'Scene 1', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
      { id: 'scene_2', projectId: 'proj_1', order: 2, summary: 'Scene 2', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
      { id: 'scene_3', projectId: 'proj_1', order: 3, summary: 'Scene 3', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
    ];

    beforeEach(() => {
      useStoryboardStore.setState({ scenes });
    });

    it('should move scene from index 0 to index 2', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 0, 2);

      const result = useStoryboardStore.getState().scenes;
      expect(result[0].id).toBe('scene_2');
      expect(result[1].id).toBe('scene_3');
      expect(result[2].id).toBe('scene_1');
    });

    it('should update order numbers correctly', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 2, 0);

      const result = useStoryboardStore.getState().scenes;
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(3);
    });

    it('should save reordered scenes to storage', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 0, 1);

      expect(storage.saveScenes).toHaveBeenCalled();
    });
  });

  describe('setCurrentScene', () => {
    it('should set currentSceneId', () => {
      const { setCurrentScene } = useStoryboardStore.getState();
      setCurrentScene('scene_1');

      expect(useStoryboardStore.getState().currentSceneId).toBe('scene_1');
    });

    it('should set currentSceneId to null', () => {
      useStoryboardStore.setState({ currentSceneId: 'scene_1' });

      const { setCurrentScene } = useStoryboardStore.getState();
      setCurrentScene(null);

      expect(useStoryboardStore.getState().currentSceneId).toBeNull();
    });
  });

  describe('setGenerating', () => {
    it('should set isGenerating to true', () => {
      const { setGenerating } = useStoryboardStore.getState();
      setGenerating(true);

      expect(useStoryboardStore.getState().isGenerating).toBe(true);
    });

    it('should set isGenerating to false', () => {
      useStoryboardStore.setState({ isGenerating: true });

      const { setGenerating } = useStoryboardStore.getState();
      setGenerating(false);

      expect(useStoryboardStore.getState().isGenerating).toBe(false);
    });
  });
});
