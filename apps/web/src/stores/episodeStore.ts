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
  apiWorkflowBuildNarrativeCausalChain,
  apiWorkflowGenerateEpisodeCoreExpression,
  apiWorkflowGenerateEpisodeSceneList,
  apiWorkflowPlanEpisodes,
} from '@/lib/api/workflow';
import {
  logAICall,
  updateLogProgress,
  updateLogWithError,
  updateLogWithResponse,
} from '@/lib/ai/debugLogger';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';

type NormalizedJobProgress = { pct: number | null; message: string | null };

interface ProgressLike {
  pct?: unknown;
  message?: unknown;
}

interface ResultLike {
  tokenUsage?: unknown;
  extractedJson?: unknown;
  raw?: unknown;
}

function normalizeJobProgress(progress: unknown): NormalizedJobProgress {
  const p = progress as ProgressLike | undefined;
  const pct = typeof p?.pct === 'number' ? p.pct : null;
  const message = typeof p?.message === 'string' ? p.message : null;
  return { pct, message };
}

function normalizeJobTokenUsage(
  raw: unknown,
): { prompt: number; completion: number; total: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const prompt = r.prompt;
  const completion = r.completion;
  const total = r.total;
  if (typeof prompt !== 'number' || typeof completion !== 'number' || typeof total !== 'number')
    return undefined;
  return { prompt, completion, total };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? '');
  }
}

interface EpisodeStore {
  episodes: Episode[];
  currentEpisodeId: string | null;
  isLoading: boolean;
  isRunningWorkflow: boolean;
  lastJobId: string | null;
  lastJobProgress: NormalizedJobProgress | null;
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

  buildNarrativeCausalChain: (input: {
    projectId: string;
    aiProfileId: string;
    phase?: number;
  }) => Promise<void>;
}

export const useEpisodeStore = create<EpisodeStore>((set, get) => ({
  episodes: [],
  currentEpisodeId: null,
  isLoading: false,
  isRunningWorkflow: false,
  lastJobId: null,
  lastJobProgress: null,
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
    set({ isRunningWorkflow: true, error: null, lastJobId: null, lastJobProgress: null });

    const cfg = useConfigStore.getState().config;
    const logId = logAICall('episode_plan', {
      skillName: 'workflow:plan_episodes',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/episode-plan',
      filledPrompt: `POST /workflow/projects/${input.projectId}/episode-plan`,
      messages: [{ role: 'user', content: safeJson(input) }],
      context: { projectId: input.projectId },
      config: {
        provider: cfg?.provider ?? 'api',
        model: cfg?.model ?? 'workflow',
        maxTokens: cfg?.generationParams?.maxTokens,
        profileId: cfg?.aiProfileId ?? input.aiProfileId,
      },
    });

    try {
      const job = await apiWorkflowPlanEpisodes(input);
      set({ lastJobId: job.id });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          set({ lastJobProgress: next });
          if (typeof next.pct === 'number')
            updateLogProgress(logId, next.pct, next.message ?? undefined);
        },
      });

      const result = (finished.result ?? null) as ResultLike | null;
      const tokenUsage = normalizeJobTokenUsage(result?.tokenUsage);
      const content =
        typeof result?.extractedJson === 'string'
          ? result.extractedJson
          : typeof result?.raw === 'string'
            ? result.raw
            : safeJson(result);
      updateLogWithResponse(logId, { content, tokenUsage });
      get().loadEpisodes(input.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, message);
      set({ error: message });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },

  generateCoreExpression: async (input) => {
    if (!isApiMode()) {
      throw new Error('核心表达生成仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null, lastJobProgress: null });

    const cfg = useConfigStore.getState().config;
    const logId = logAICall('episode_core_expression', {
      skillName: 'workflow:generate_episode_core_expression',
      promptTemplate:
        'POST /workflow/projects/{{projectId}}/episodes/{{episodeId}}/core-expression',
      filledPrompt: `POST /workflow/projects/${input.projectId}/episodes/${input.episodeId}/core-expression`,
      messages: [{ role: 'user', content: safeJson(input) }],
      context: { projectId: input.projectId },
      config: {
        provider: cfg?.provider ?? 'api',
        model: cfg?.model ?? 'workflow',
        maxTokens: cfg?.generationParams?.maxTokens,
        profileId: cfg?.aiProfileId ?? input.aiProfileId,
      },
    });

    try {
      const job = await apiWorkflowGenerateEpisodeCoreExpression(input);
      set({ lastJobId: job.id });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          set({ lastJobProgress: next });
          if (typeof next.pct === 'number')
            updateLogProgress(logId, next.pct, next.message ?? undefined);
        },
      });

      const result = (finished.result ?? null) as ResultLike | null;
      const tokenUsage = normalizeJobTokenUsage(result?.tokenUsage);
      const content =
        typeof result?.extractedJson === 'string' ? result.extractedJson : safeJson(result);
      updateLogWithResponse(logId, { content, tokenUsage });
      get().loadEpisodes(input.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, message);
      set({ error: message });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },

  generateSceneList: async (input) => {
    if (!isApiMode()) {
      throw new Error('分镜生成仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null, lastJobProgress: null });

    const cfg = useConfigStore.getState().config;
    const logId = logAICall('episode_scene_list', {
      skillName: 'workflow:generate_episode_scene_list',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/episodes/{{episodeId}}/scene-list',
      filledPrompt: `POST /workflow/projects/${input.projectId}/episodes/${input.episodeId}/scene-list`,
      messages: [{ role: 'user', content: safeJson(input) }],
      context: { projectId: input.projectId },
      config: {
        provider: cfg?.provider ?? 'api',
        model: cfg?.model ?? 'workflow',
        maxTokens: cfg?.generationParams?.maxTokens,
        profileId: cfg?.aiProfileId ?? input.aiProfileId,
      },
    });

    try {
      const job = await apiWorkflowGenerateEpisodeSceneList(input);
      set({ lastJobId: job.id });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          set({ lastJobProgress: next });
          if (typeof next.pct === 'number')
            updateLogProgress(logId, next.pct, next.message ?? undefined);
        },
      });

      const result = (finished.result ?? null) as ResultLike | null;
      const tokenUsage = normalizeJobTokenUsage(result?.tokenUsage);
      updateLogWithResponse(logId, { content: safeJson(result), tokenUsage });
      get().loadEpisodes(input.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, message);
      set({ error: message });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },

  buildNarrativeCausalChain: async (input) => {
    if (!isApiMode()) {
      throw new Error('叙事因果链生成仅在 API 模式可用');
    }
    set({ isRunningWorkflow: true, error: null, lastJobId: null, lastJobProgress: null });

    const cfg = useConfigStore.getState().config;
    const logId = logAICall('narrative_causal_chain', {
      skillName: 'workflow:build_narrative_causal_chain',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/narrative-causal-chain',
      filledPrompt: `POST /workflow/projects/${input.projectId}/narrative-causal-chain`,
      messages: [{ role: 'user', content: safeJson(input) }],
      context: { projectId: input.projectId },
      config: {
        provider: cfg?.provider ?? 'api',
        model: cfg?.model ?? 'workflow',
        maxTokens: cfg?.generationParams?.maxTokens,
        profileId: cfg?.aiProfileId ?? input.aiProfileId,
      },
    });

    try {
      const job = await apiWorkflowBuildNarrativeCausalChain(input);
      set({ lastJobId: job.id });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          set({ lastJobProgress: next });
          if (typeof next.pct === 'number')
            updateLogProgress(logId, next.pct, next.message ?? undefined);
        },
      });

      const result = (finished.result ?? null) as ResultLike | null;
      const tokenUsage = normalizeJobTokenUsage(result?.tokenUsage);
      const content =
        typeof result?.extractedJson === 'string'
          ? result.extractedJson
          : typeof result?.raw === 'string'
            ? result.raw
            : safeJson(result);
      updateLogWithResponse(logId, { content, tokenUsage });

      // 刷新项目以拿到最新的 contextCache.narrativeCausalChain
      useProjectStore.getState().loadProject(input.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, message);
      set({ error: message });
      throw error;
    } finally {
      set({ isRunningWorkflow: false });
    }
  },
}));
