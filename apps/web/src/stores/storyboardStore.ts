import { create } from 'zustand';
import {
  Scene,
  SceneStatus,
  SceneRefinementManualOverrides,
  SceneRefinementSkipSteps,
} from '@/types';
import { getScenes, saveScene, saveScenePatchBatched, saveScenes } from '@/lib/storage';
import { isApiMode } from '@/lib/runtime/mode';
import { apiCreateScene, apiDeleteScene, apiListScenes, apiReorderScenes } from '@/lib/api/scenes';
import { queueApiScenePatch } from '@/lib/api/scenePatchQueue';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface StoryboardStore {
  scenes: Scene[];
  currentSceneId: string | null;
  isGenerating: boolean;
  skipSteps: Record<string, SceneRefinementSkipSteps>;
  manualOverrides: Record<string, SceneRefinementManualOverrides>;

  // 操作方法
  loadScenes: (projectId: string) => void;
  setScenes: (projectId: string, scenes: Scene[]) => void;
  addScene: (projectId: string, scene: Omit<Scene, 'id'>) => Scene;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  deleteScene: (projectId: string, sceneId: string) => void;
  reorderScenes: (projectId: string, fromIndex: number, toIndex: number) => void;
  setCurrentScene: (sceneId: string | null) => void;
  setGenerating: (isGenerating: boolean) => void;
  setSceneSkipSteps: (
    projectId: string,
    sceneId: string,
    updates: SceneRefinementSkipSteps,
  ) => void;
  setSceneManualOverrides: (
    projectId: string,
    sceneId: string,
    updates: SceneRefinementManualOverrides,
  ) => void;
}

export const useStoryboardStore = create<StoryboardStore>((set, get) => ({
  scenes: [],
  currentSceneId: null,
  isGenerating: false,
  skipSteps: {},
  manualOverrides: {},

  setSceneSkipSteps: (projectId, sceneId, updates) => {
    const scenes = get().scenes;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const prevSummary = isRecord(scene.contextSummary) ? scene.contextSummary : {};
    const prevRefinement = isRecord(prevSummary.refinement) ? prevSummary.refinement : {};
    const nextRefinement = {
      ...prevRefinement,
      skipSteps: {
        ...(isRecord(prevRefinement.skipSteps) ? prevRefinement.skipSteps : {}),
        ...updates,
      },
    };
    const nextSummary = { ...(prevSummary as Record<string, unknown>), refinement: nextRefinement };

    get().updateScene(projectId, sceneId, {
      contextSummary: nextSummary as Scene['contextSummary'],
    });

    set((state) => ({
      skipSteps: {
        ...state.skipSteps,
        [sceneId]: {
          ...state.skipSteps[sceneId],
          ...updates,
        },
      },
    }));
  },

  setSceneManualOverrides: (projectId, sceneId, updates) => {
    const scenes = get().scenes;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const prevSummary = isRecord(scene.contextSummary) ? scene.contextSummary : {};
    const prevRefinement = isRecord(prevSummary.refinement) ? prevSummary.refinement : {};
    const nextRefinement = {
      ...prevRefinement,
      manualOverrides: {
        ...(isRecord(prevRefinement.manualOverrides) ? prevRefinement.manualOverrides : {}),
        ...updates,
      },
    };
    const nextSummary = { ...(prevSummary as Record<string, unknown>), refinement: nextRefinement };

    get().updateScene(projectId, sceneId, {
      contextSummary: nextSummary as Scene['contextSummary'],
    });

    set((state) => ({
      manualOverrides: {
        ...state.manualOverrides,
        [sceneId]: {
          ...state.manualOverrides[sceneId],
          ...updates,
        },
      },
    }));
  },

  loadScenes: (projectId: string) => {
    if (isApiMode()) {
      void (async () => {
        try {
          const scenes = await apiListScenes(projectId);
          const nextScenes = scenes as Scene[];
          const skipSteps = Object.fromEntries(
            nextScenes.map((scene) => [
              scene.id,
              (scene.contextSummary?.refinement?.skipSteps ?? {}) as SceneRefinementSkipSteps,
            ]),
          );
          const manualOverrides = Object.fromEntries(
            nextScenes.map((scene) => [
              scene.id,
              (scene.contextSummary?.refinement?.manualOverrides ??
                {}) as SceneRefinementManualOverrides,
            ]),
          );
          set({ scenes: nextScenes, skipSteps, manualOverrides });
        } catch (error) {
          console.error('Failed to load scenes (api):', error);
        }
      })();
      return;
    }
    const scenes = getScenes(projectId);
    const skipSteps = Object.fromEntries(
      scenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.skipSteps ?? {}) as SceneRefinementSkipSteps,
      ]),
    );
    const manualOverrides = Object.fromEntries(
      scenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.manualOverrides ?? {}) as SceneRefinementManualOverrides,
      ]),
    );
    set({ scenes, skipSteps, manualOverrides });
  },

  setScenes: (projectId: string, scenes: Scene[]) => {
    // 重新编号
    const reorderedScenes = scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));

    if (!isApiMode()) {
      saveScenes(projectId, reorderedScenes);
    } else {
      void apiReorderScenes(
        projectId,
        reorderedScenes.map((s) => s.id),
      ).catch((error) => {
        console.error('Failed to reorder scenes (api):', error);
      });
    }
    const skipSteps = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.skipSteps ?? {}) as SceneRefinementSkipSteps,
      ]),
    );
    const manualOverrides = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.manualOverrides ?? {}) as SceneRefinementManualOverrides,
      ]),
    );
    set({ scenes: reorderedScenes, skipSteps, manualOverrides });
  },

  addScene: (projectId: string, sceneData) => {
    const scenes = get().scenes;
    const newScene: Scene = {
      ...sceneData,
      id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      order: scenes.length + 1,
      status: 'pending' as SceneStatus,
      motionPrompt: sceneData.motionPrompt || '',
    };

    if (!isApiMode()) {
      saveScene(projectId, newScene);
    } else {
      void apiCreateScene(projectId, newScene).catch((error) => {
        console.error('Failed to create scene (api):', error);
      });
    }
    set({ scenes: [...scenes, newScene] });

    return newScene;
  },

  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => {
    const scenes = get().scenes;
    const scene = scenes.find((s) => s.id === sceneId);

    if (scene) {
      const updatedScene = { ...scene, ...updates };
      if (!isApiMode()) {
        saveScenePatchBatched(projectId, sceneId, updates);
      } else {
        queueApiScenePatch(projectId, sceneId, updates);
      }

      const nextScenes = scenes.map((s) => (s.id === sceneId ? updatedScene : s));
      const nextSkipSteps = { ...get().skipSteps };
      const nextManualOverrides = { ...get().manualOverrides };
      if (updates.contextSummary !== undefined) {
        nextSkipSteps[sceneId] = (updatedScene.contextSummary?.refinement?.skipSteps ??
          {}) as SceneRefinementSkipSteps;
        nextManualOverrides[sceneId] = (updatedScene.contextSummary?.refinement?.manualOverrides ??
          {}) as SceneRefinementManualOverrides;
      }

      set({
        scenes: nextScenes,
        skipSteps: nextSkipSteps,
        manualOverrides: nextManualOverrides,
      });
    }
  },

  deleteScene: (projectId: string, sceneId: string) => {
    const scenes = get().scenes.filter((s) => s.id !== sceneId);

    // 重新编号
    const reorderedScenes = scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));

    if (!isApiMode()) {
      saveScenes(projectId, reorderedScenes);
    } else {
      void apiDeleteScene(projectId, sceneId).catch((error) => {
        console.error('Failed to delete scene (api):', error);
      });
      void apiReorderScenes(
        projectId,
        reorderedScenes.map((s) => s.id),
      ).catch((error) => {
        console.error('Failed to reorder scenes after delete (api):', error);
      });
    }
    const skipSteps = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.skipSteps ?? {}) as SceneRefinementSkipSteps,
      ]),
    );
    const manualOverrides = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.manualOverrides ?? {}) as SceneRefinementManualOverrides,
      ]),
    );
    set({ scenes: reorderedScenes, skipSteps, manualOverrides });
  },

  reorderScenes: (projectId: string, fromIndex: number, toIndex: number) => {
    const scenes = [...get().scenes];
    const [movedScene] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, movedScene);

    // 重新编号
    const reorderedScenes = scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));

    if (!isApiMode()) {
      saveScenes(projectId, reorderedScenes);
    } else {
      void apiReorderScenes(
        projectId,
        reorderedScenes.map((s) => s.id),
      ).catch((error) => {
        console.error('Failed to reorder scenes (api):', error);
      });
    }
    const skipSteps = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.skipSteps ?? {}) as SceneRefinementSkipSteps,
      ]),
    );
    const manualOverrides = Object.fromEntries(
      reorderedScenes.map((scene) => [
        scene.id,
        (scene.contextSummary?.refinement?.manualOverrides ?? {}) as SceneRefinementManualOverrides,
      ]),
    );
    set({ scenes: reorderedScenes, skipSteps, manualOverrides });
  },

  setCurrentScene: (sceneId: string | null) => {
    set({ currentSceneId: sceneId });
  },

  setGenerating: (isGenerating: boolean) => {
    set({ isGenerating });
  },
}));
