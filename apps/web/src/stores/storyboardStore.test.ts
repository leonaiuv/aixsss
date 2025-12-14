import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStoryboardStore } from './storyboardStore';
import * as storage from '@/lib/storage';
import { Scene } from '@/types';

// Mock storage functions
vi.mock('@/lib/storage', () => ({
  getScenes: vi.fn(() => []),
  saveScene: vi.fn(),
  saveScenePatchBatched: vi.fn(),
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

      expect(storage.saveScenePatchBatched).toHaveBeenCalled();
    });

    it('should not update if scene not found', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'nonexistent', { summary: 'Updated' });

      expect(storage.saveScenePatchBatched).not.toHaveBeenCalled();
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

  describe('updateSceneDialogues', () => {
    const existingScene: Scene = {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: 'Test Scene',
      sceneDescription: 'A test scene',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
      dialogues: [],
    };

    beforeEach(() => {
      useStoryboardStore.setState({ scenes: [existingScene] });
    });

    it('should add dialogues to scene', () => {
      const dialogues = [
        { id: 'dl_1', type: 'dialogue' as const, characterName: '小明', content: '你好！', order: 1 },
        { id: 'dl_2', type: 'narration' as const, content: '两人相视而笑', order: 2 },
      ];

      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { dialogues });

      const updated = useStoryboardStore.getState().scenes.find(s => s.id === 'scene_1');
      expect(updated?.dialogues).toHaveLength(2);
      expect(updated?.dialogues?.[0].characterName).toBe('小明');
      expect(updated?.dialogues?.[1].type).toBe('narration');
    });

    it('should replace existing dialogues', () => {
      // First add some dialogues
      useStoryboardStore.setState({
        scenes: [{
          ...existingScene,
          dialogues: [{ id: 'old_1', type: 'dialogue' as const, characterName: 'Old', content: 'Old content', order: 1 }],
        }],
      });

      const newDialogues = [
        { id: 'new_1', type: 'monologue' as const, characterName: '主角', content: '新台词', order: 1 },
      ];

      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { dialogues: newDialogues });

      const updated = useStoryboardStore.getState().scenes.find(s => s.id === 'scene_1');
      expect(updated?.dialogues).toHaveLength(1);
      expect(updated?.dialogues?.[0].id).toBe('new_1');
    });

    it('should save dialogues to storage', () => {
      const dialogues = [{ id: 'dl_1', type: 'thought' as const, characterName: '角色', content: '心理活动', order: 1 }];

      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { dialogues });

      expect(storage.saveScenePatchBatched).toHaveBeenCalled();
    });

    it('should handle empty dialogues array', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { dialogues: [] });

      const updated = useStoryboardStore.getState().scenes.find(s => s.id === 'scene_1');
      expect(updated?.dialogues).toEqual([]);
    });
  });

  describe('boundary conditions for reordering', () => {
    const scenes: Scene[] = [
      { id: 'scene_1', projectId: 'proj_1', order: 1, summary: 'Scene 1', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
      { id: 'scene_2', projectId: 'proj_1', order: 2, summary: 'Scene 2', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
      { id: 'scene_3', projectId: 'proj_1', order: 3, summary: 'Scene 3', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
      { id: 'scene_4', projectId: 'proj_1', order: 4, summary: 'Scene 4', sceneDescription: '', actionDescription: '', shotPrompt: '', motionPrompt: '', status: 'pending', notes: '' },
    ];

    beforeEach(() => {
      useStoryboardStore.setState({ scenes });
    });

    it('should handle moving scene to first position', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 3, 0);

      const result = useStoryboardStore.getState().scenes;
      expect(result[0].id).toBe('scene_4');
      expect(result[0].order).toBe(1);
    });

    it('should handle moving scene to last position', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 0, 3);

      const result = useStoryboardStore.getState().scenes;
      expect(result[3].id).toBe('scene_1');
      expect(result[3].order).toBe(4);
    });

    it('should handle moving scene to middle position', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 0, 2);

      const result = useStoryboardStore.getState().scenes;
      expect(result[2].id).toBe('scene_1');
      expect(result[0].id).toBe('scene_2');
      expect(result[1].id).toBe('scene_3');
    });

    it('should handle moving scene to same position', () => {
      const { reorderScenes } = useStoryboardStore.getState();
      reorderScenes('proj_1', 1, 1);

      const result = useStoryboardStore.getState().scenes;
      expect(result[1].id).toBe('scene_2');
      expect(result).toHaveLength(4);
    });

    it('should correctly reorder when deleting middle scene', () => {
      const { deleteScene } = useStoryboardStore.getState();
      deleteScene('proj_1', 'scene_2');

      const result = useStoryboardStore.getState().scenes;
      expect(result).toHaveLength(3);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(3);
      expect(result[1].id).toBe('scene_3');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent scene additions', () => {
      const { addScene } = useStoryboardStore.getState();
      
      const scene1 = addScene('proj_1', {
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene 1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      });

      const scene2 = addScene('proj_1', {
        projectId: 'proj_1',
        order: 1,
        summary: 'Scene 2',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      });

      expect(scene1.order).toBe(1);
      expect(scene2.order).toBe(2);
      expect(scene1.id).not.toBe(scene2.id);
    });

    it('should handle concurrent scene updates', () => {
      const scene: Scene = {
        id: 'scene_1',
        projectId: 'proj_1',
        order: 1,
        summary: 'Original',
        sceneDescription: 'Desc',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      };
      useStoryboardStore.setState({ scenes: [scene] });

      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { summary: 'Update 1' });
      updateScene('proj_1', 'scene_1', { sceneDescription: 'New Desc' });
      updateScene('proj_1', 'scene_1', { status: 'completed' });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.summary).toBe('Update 1');
      expect(updated.sceneDescription).toBe('New Desc');
      expect(updated.status).toBe('completed');
    });
  });

  describe('performance and edge cases', () => {
    it('should handle loading 500+ scenes efficiently', () => {
      const largeSceneSet: Scene[] = Array.from({ length: 500 }, (_, i) => ({
        id: `scene_${i}`,
        projectId: 'proj_1',
        order: i + 1,
        summary: `Scene ${i}`,
        sceneDescription: `Description ${i}`,
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending' as const,
        notes: '',
      }));

      vi.mocked(storage.getScenes).mockReturnValue(largeSceneSet);

      const startTime = performance.now();
      const { loadScenes } = useStoryboardStore.getState();
      loadScenes('proj_1');
      const endTime = performance.now();

      expect(useStoryboardStore.getState().scenes).toHaveLength(500);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle scene with null/undefined contextSummary', () => {
      const sceneWithoutContext: Scene = {
        id: 'scene_1',
        projectId: 'proj_1',
        order: 1,
        summary: 'Test',
        sceneDescription: 'Desc',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
        contextSummary: undefined,
      };

      const { addScene, updateScene } = useStoryboardStore.getState();
      useStoryboardStore.setState({ scenes: [sceneWithoutContext] });

      expect(() => updateScene('proj_1', 'scene_1', { summary: 'Updated' })).not.toThrow();
    });

    it('should handle empty scene list operations', () => {
      useStoryboardStore.setState({ scenes: [] });
      const { deleteScene, reorderScenes, updateScene } = useStoryboardStore.getState();

      expect(() => deleteScene('proj_1', 'nonexistent')).not.toThrow();
      expect(() => reorderScenes('proj_1', 0, 1)).not.toThrow();
      expect(() => updateScene('proj_1', 'nonexistent', { summary: 'Test' })).not.toThrow();
    });

    it('should generate unique IDs for 1000 scenes', () => {
      const { addScene } = useStoryboardStore.getState();
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const scene = addScene('proj_1', {
          projectId: 'proj_1',
          order: 1,
          summary: `Scene ${i}`,
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        });
        ids.add(scene.id);
      }

      expect(ids.size).toBe(1000);
    });
  });

  describe('status transitions', () => {
    const scene: Scene = {
      id: 'scene_1',
      projectId: 'proj_1',
      order: 1,
      summary: 'Test',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
    };

    beforeEach(() => {
      useStoryboardStore.setState({ scenes: [scene] });
    });

    it('should allow transitioning from pending to generating', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { status: 'generating' });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.status).toBe('generating');
    });

    it('should allow transitioning from generating to completed', () => {
      useStoryboardStore.setState({ scenes: [{ ...scene, status: 'generating' }] });
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { status: 'completed' });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.status).toBe('completed');
    });

    it('should allow transitioning from completed to needs_update', () => {
      useStoryboardStore.setState({ scenes: [{ ...scene, status: 'completed' }] });
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { status: 'needs_update' });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.status).toBe('needs_update');
    });

    it('should allow transitioning to error status', () => {
      const { updateScene } = useStoryboardStore.getState();
      updateScene('proj_1', 'scene_1', { status: 'error' });

      const updated = useStoryboardStore.getState().scenes[0];
      expect(updated.status).toBe('error');
    });
  });
});
