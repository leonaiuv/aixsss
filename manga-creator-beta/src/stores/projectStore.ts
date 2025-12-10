import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ProjectState } from '@/types';

// =====================
// Store 接口定义
// =====================
export interface ProjectUIState {
  // UI 状态
  isLoading: boolean;
  currentThreadId: string | null;
  selectedSceneIndex: number;
  isGenerating: boolean;
  generatingStep: string | null;
  error: string | null;

  // Agent 状态镜像
  projectState: ProjectState | null;

  // Actions
  setLoading: (loading: boolean) => void;
  setCurrentThread: (threadId: string | null) => void;
  setSelectedScene: (index: number) => void;
  setGenerating: (generating: boolean, step?: string) => void;
  setError: (error: string | null) => void;
  syncFromAgent: (state: ProjectState) => void;
  reset: () => void;
}

// =====================
// 初始状态
// =====================
const initialState = {
  isLoading: false,
  currentThreadId: null,
  selectedSceneIndex: 0,
  isGenerating: false,
  generatingStep: null,
  error: null,
  projectState: null,
};

// =====================
// 创建 Store
// =====================
export const useProjectStore = create<ProjectUIState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setLoading: (loading) => set({ isLoading: loading }),

    setCurrentThread: (threadId) => set({ currentThreadId: threadId }),

    setSelectedScene: (index) => set({ selectedSceneIndex: index }),

    setGenerating: (generating, step) =>
      set({
        isGenerating: generating,
        generatingStep: step ?? null,
      }),

    setError: (error) => set({ error }),

    syncFromAgent: (state) => set({ projectState: state }),

    reset: () => set(initialState),
  }))
);
