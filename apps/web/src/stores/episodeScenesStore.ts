import { create } from 'zustand';
import type { Scene } from '@/types';
import { isApiMode } from '@/lib/runtime/mode';
import {
  apiCreateEpisodeScene,
  apiDeleteEpisodeScene,
  apiListEpisodeScenes,
  apiReorderEpisodeScenes,
} from '@/lib/api/episodeScenes';
import { queueApiEpisodeScenePatch } from '@/lib/api/episodeScenePatchQueue';

interface EpisodeScenesStore {
  scenes: Scene[];
  isLoading: boolean;
  error: string | null;

  loadScenes: (projectId: string, episodeId: string) => void;
  addScene: (projectId: string, episodeId: string, scene: Omit<Scene, 'id'>) => Promise<Scene>;
  updateScene: (
    projectId: string,
    episodeId: string,
    sceneId: string,
    updates: Partial<Scene>,
  ) => void;
  deleteScene: (projectId: string, episodeId: string, sceneId: string) => Promise<void>;
  reorderScenes: (projectId: string, episodeId: string, fromIndex: number, toIndex: number) => void;
  setScenes: (scenes: Scene[]) => void;
}

export const useEpisodeScenesStore = create<EpisodeScenesStore>((set, get) => ({
  scenes: [],
  isLoading: false,
  error: null,

  loadScenes: (projectId, episodeId) => {
    if (!isApiMode()) {
      set({ scenes: [], isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    void (async () => {
      try {
        const scenes = await apiListEpisodeScenes(projectId, episodeId);
        set({ scenes: scenes as Scene[], isLoading: false });
      } catch (error) {
        console.error('Failed to load episode scenes (api):', error);
        set({ isLoading: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  },

  setScenes: (scenes) => {
    set({ scenes });
  },

  addScene: async (projectId, episodeId, sceneData) => {
    if (!isApiMode()) {
      throw new Error('Episode Scenes 仅在 API 模式可用');
    }
    set({ error: null });
    const scenes = get().scenes;
    const newScene: Scene = {
      ...sceneData,
      id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      projectId,
      episodeId,
      order: scenes.length + 1,
      status: 'pending',
      motionPrompt: sceneData.motionPrompt || '',
    };
    const created = await apiCreateEpisodeScene(projectId, episodeId, newScene);
    set((state) => ({ scenes: [...state.scenes, created as Scene] }));
    return created as Scene;
  },

  updateScene: (projectId, episodeId, sceneId, updates) => {
    const scenes = get().scenes;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const updatedScene: Scene = { ...scene, ...updates };
    set({ scenes: scenes.map((s) => (s.id === sceneId ? updatedScene : s)) });

    if (!isApiMode()) return;
    queueApiEpisodeScenePatch(
      projectId,
      episodeId,
      sceneId,
      updates,
    );
  },

  deleteScene: async (projectId, episodeId, sceneId) => {
    if (!isApiMode()) {
      throw new Error('Episode Scenes 仅在 API 模式可用');
    }
    set({ error: null });
    await apiDeleteEpisodeScene(projectId, episodeId, sceneId);
    const scenes = get().scenes.filter((s) => s.id !== sceneId);
    const reordered = scenes.map((s, idx) => ({ ...s, order: idx + 1 }));
    set({ scenes: reordered });
    void apiReorderEpisodeScenes(
      projectId,
      episodeId,
      reordered.map((s) => s.id),
    ).catch((error) =>
      console.error('Failed to reorder episode scenes after delete (api):', error),
    );
  },

  reorderScenes: (projectId, episodeId, fromIndex, toIndex) => {
    const scenes = [...get().scenes];
    const [moved] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, moved);

    const reordered = scenes.map((s, idx) => ({ ...s, order: idx + 1 }));
    set({ scenes: reordered });

    if (!isApiMode()) return;
    void apiReorderEpisodeScenes(
      projectId,
      episodeId,
      reordered.map((s) => s.id),
    ).catch((error) => console.error('Failed to reorder episode scenes (api):', error));
  },
}));
