import { create } from 'zustand';
import type { EmotionArcPoint, Project } from '@/types';
import { isApiMode } from '@/lib/runtime/mode';
import { apiGetProject } from '@/lib/api/projects';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import { apiWorkflowGenerateEmotionArc } from '@/lib/api/workflow';

function normalizeEmotionArc(value: unknown): EmotionArcPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      beat: typeof item.beat === 'string' ? item.beat : '',
      value: typeof item.value === 'number' ? item.value : 0,
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    }))
    .filter((item) => item.beat.trim().length > 0);
}

interface EmotionArcStore {
  emotionArc: EmotionArcPoint[];
  isLoading: boolean;
  isGenerating: boolean;
  lastJobId: string | null;
  error: string | null;
  loadFromProject: (project: Project | null) => void;
  syncFromApi: (projectId: string) => Promise<void>;
  generateEmotionArc: (input: { projectId: string; aiProfileId: string }) => Promise<void>;
}

export const useEmotionArcStore = create<EmotionArcStore>((set) => ({
  emotionArc: [],
  isLoading: false,
  isGenerating: false,
  lastJobId: null,
  error: null,

  loadFromProject: (project) => {
    const source = project?.contextCache?.emotionArc;
    set({ emotionArc: normalizeEmotionArc(source) });
  },

  syncFromApi: async (projectId) => {
    if (!isApiMode()) {
      set({ emotionArc: [] });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const project = await apiGetProject(projectId);
      set({
        emotionArc: normalizeEmotionArc(project.contextCache?.emotionArc),
        isLoading: false,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set({ isLoading: false, error: detail });
      throw error;
    }
  },

  generateEmotionArc: async (input) => {
    if (!isApiMode()) {
      throw new Error('情绪弧线生成仅在 API 模式可用');
    }
    set({ isGenerating: true, error: null, lastJobId: null });
    try {
      const job = await apiWorkflowGenerateEmotionArc(input);
      set({ lastJobId: job.id });
      await apiWaitForAIJob(job.id, {
        onProgress: () => undefined,
      });
      const project = await apiGetProject(input.projectId);
      set({ emotionArc: normalizeEmotionArc(project.contextCache?.emotionArc) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set({ error: detail });
      throw error;
    } finally {
      set({ isGenerating: false });
    }
  },
}));
