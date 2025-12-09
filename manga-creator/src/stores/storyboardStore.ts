import { create } from 'zustand';
import { Scene, SceneStatus } from '@/types';
import { getScenes, saveScene, saveScenes } from '@/lib/storage';

interface StoryboardStore {
  scenes: Scene[];
  currentSceneId: string | null;
  isGenerating: boolean;
  
  // 操作方法
  loadScenes: (projectId: string) => void;
  setScenes: (projectId: string, scenes: Scene[]) => void;
  addScene: (projectId: string, scene: Omit<Scene, 'id'>) => Scene;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => void;
  deleteScene: (projectId: string, sceneId: string) => void;
  reorderScenes: (projectId: string, fromIndex: number, toIndex: number) => void;
  setCurrentScene: (sceneId: string | null) => void;
  setGenerating: (isGenerating: boolean) => void;
}

export const useStoryboardStore = create<StoryboardStore>((set, get) => ({
  scenes: [],
  currentSceneId: null,
  isGenerating: false,
  
  loadScenes: (projectId: string) => {
    const scenes = getScenes(projectId);
    set({ scenes });
  },
  
  setScenes: (projectId: string, scenes: Scene[]) => {
    // 重新编号
    const reorderedScenes = scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));
    
    saveScenes(projectId, reorderedScenes);
    set({ scenes: reorderedScenes });
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
    
    saveScene(projectId, newScene);
    set({ scenes: [...scenes, newScene] });
    
    return newScene;
  },
  
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => {
    const scenes = get().scenes;
    const scene = scenes.find(s => s.id === sceneId);
    
    if (scene) {
      const updatedScene = { ...scene, ...updates };
      saveScene(projectId, updatedScene);
      
      set({
        scenes: scenes.map(s => s.id === sceneId ? updatedScene : s),
      });
    }
  },
  
  deleteScene: (projectId: string, sceneId: string) => {
    const scenes = get().scenes.filter(s => s.id !== sceneId);
    
    // 重新编号
    const reorderedScenes = scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));
    
    saveScenes(projectId, reorderedScenes);
    set({ scenes: reorderedScenes });
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
    
    saveScenes(projectId, reorderedScenes);
    set({ scenes: reorderedScenes });
  },
  
  setCurrentScene: (sceneId: string | null) => {
    set({ currentSceneId: sceneId });
  },
  
  setGenerating: (isGenerating: boolean) => {
    set({ isGenerating });
  },
}));
