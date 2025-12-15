import { create } from 'zustand';
import type { Episode } from '@/types';
import { isApiMode } from '@/lib/runtime/mode';
import {
  apiCreateEpisode,
  apiDeleteEpisode,
  apiListEpisodes,
  apiUpdateEpisode,
} from '@/lib/api/episodes';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import {
  apiWorkflowGenerateEpisodeCoreExpression,
  apiWorkflowGenerateEpisodeSceneList,
  apiWorkflowPlanEpisodes,
} from '@/lib/api/workflow';

interface EpisodeStore {
  episodes: Episode[];
  currentEpisodeId: string | null;
  isLoading: boolean;
  isRunningWorkflow: boolean;
  lastJobId: string | null;
  error: string | null;

  loadEpisodes: (projectId: string) => void;
  setCurrentEpisode: (episodeId: string | null) => void;

  createEpisode: (
    projectId: string,
    input: Partial<Episode> & Pick<Episode, 'order'>,
  ) => Promise<Episode>;
  updateEpisode: (
    projectId: string,
    episodeId: string,
    updates: Partial<Episode>,
  ) => Promise<Episode>;
  deleteEpisode: (projectId: string, episodeId: string) => Promise<void>;

  planEpisodes: (input: {
    projectId: string;
    aiProfileId: string;
    targetEpisodeCount?: number;
  }) => Promise<void>;
  generateCoreExpression: (input: {
    projectId: string;
    episodeId: string;
    aiProfileId: string;
  }) => Promise<void>;
  generateSceneList: (input: {
    projectId: string;
    episodeId: string;
    aiProfileId: string;
    sceneCountHint?: number;
  }) => Promise<void>;
}

export const useEpisodeStore = create<EpisodeStore>((set, get) => ({
  episodes: [],
  currentEpisodeId: null,
  isLoading: false,
  isRunningWorkflow: false,
  lastJobId: null,
  error: null,

  loadEpisodes: (projectId: string) => {
    if (!isApiMode()) {
      set({ episodes: [], currentEpisodeId: null, isLoading: false });
      return;
    }

    const prevEpisodes = get().episodes;
    const isSameProject = prevEpisodes.length > 0 && prevEpisodes[0].projectId === projectId;

    // 关键：切换项目时必须清空，避免沿用旧的 episodeId 去请求新项目导致 404
    set({
      isLoading: true,
      error: null,
      ...(isSameProject ? {} : { episodes: [], currentEpisodeId: null }),
    });
    void (async () => {
      try {
        const episodes = await apiListEpisodes(projectId);
        const currentId = get().currentEpisodeId;
        const hasCurrent = currentId ? episodes.some((e) => e.id === currentId) : false;
        set({
          episodes,
          isLoading: false,
          currentEpisodeId: hasCurrent ? currentId : (episodes[0]?.id ?? null),
        });
      } catch (error) {
        console.error('Failed to load episodes (api):', error);
        set({ isLoading: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  },

  setCurrentEpisode: (episodeId) => {
    set({ currentEpisodeId: episodeId });
  },

  createEpisode: async (projectId, input) => {
    if (!isApiMode()) {
      throw new Error('Episode 仅在 API 模式可用');
    }
    set({ error: null });
    const created = await apiCreateEpisode(projectId, input);
    set((state) => ({
      episodes: [...state.episodes, created].sort((a, b) => a.order - b.order),
      currentEpisodeId: created.id,
    }));
    return created;
  },

  updateEpisode: async (projectId, episodeId, updates) => {
    if (!isApiMode()) {
      throw new Error('Episode 仅在 API 模式可用');
    }
    set({ error: null });
    const updated = await apiUpdateEpisode(projectId, episodeId, updates);
    set((state) => ({
      episodes: state.episodes
        .map((e) => (e.id === episodeId ? updated : e))
        .sort((a, b) => a.order - b.order),
    }));
    return updated;
  },

  deleteEpisode: async (projectId, episodeId) => {
    if (!isApiMode()) {
      throw new Error('Episode 仅在 API 模式可用');
    }
    set({ error: null });
    await apiDeleteEpisode(projectId, episodeId);
    set((state) => {
      const next = state.episodes.filter((e) => e.id !== episodeId);
      const currentEpisodeId =
        state.currentEpisodeId === episodeId ? (next[0]?.id ?? null) : state.currentEpisodeId;
      return { episodes: next, currentEpisodeId };
    });
  },

  planEpisodes: async (input) => {
    if (!isApiMode()) {
      throw new Error('Episode 规划仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null });
    try {
      const job = await apiWorkflowPlanEpisodes(input);
      set({ lastJobId: job.id });
      await apiWaitForAIJob(job.id);
      get().loadEpisodes(input.projectId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },

  generateCoreExpression: async (input) => {
    if (!isApiMode()) {
      throw new Error('核心表达生成仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null });
    try {
      const job = await apiWorkflowGenerateEpisodeCoreExpression(input);
      set({ lastJobId: job.id });
      await apiWaitForAIJob(job.id);
      get().loadEpisodes(input.projectId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },

  generateSceneList: async (input) => {
    if (!isApiMode()) {
      throw new Error('分镜生成仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null });
    try {
      const job = await apiWorkflowGenerateEpisodeSceneList(input);
      set({ lastJobId: job.id });
      await apiWaitForAIJob(job.id);
      get().loadEpisodes(input.projectId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },
}));
