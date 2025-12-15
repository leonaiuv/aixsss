import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/runtime/mode', () => ({ isApiMode: () => true }));

vi.mock('@/lib/api/episodes', () => ({
  apiListEpisodes: vi.fn(),
  apiCreateEpisode: vi.fn(),
  apiUpdateEpisode: vi.fn(),
  apiDeleteEpisode: vi.fn(),
}));

vi.mock('@/lib/api/workflow', () => ({
  apiWorkflowPlanEpisodes: vi.fn(),
  apiWorkflowGenerateEpisodeCoreExpression: vi.fn(),
  apiWorkflowGenerateEpisodeSceneList: vi.fn(),
}));

vi.mock('@/lib/api/aiJobs', () => ({
  apiWaitForAIJob: vi.fn(),
}));

import { useEpisodeStore } from './episodeStore';
import {
  apiListEpisodes,
  apiCreateEpisode,
  apiUpdateEpisode,
  apiDeleteEpisode,
} from '@/lib/api/episodes';
import {
  apiWorkflowPlanEpisodes,
  apiWorkflowGenerateEpisodeCoreExpression,
  apiWorkflowGenerateEpisodeSceneList,
} from '@/lib/api/workflow';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';

describe('episodeStore (api)', () => {
  beforeEach(() => {
    useEpisodeStore.setState({
      episodes: [],
      currentEpisodeId: null,
      isLoading: false,
      isRunningWorkflow: false,
      lastJobId: null,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('loadEpisodes 应写入 episodes 并设置 currentEpisodeId', async () => {
    vi.mocked(apiListEpisodes).mockResolvedValue([
      {
        id: 'ep_1',
        projectId: 'proj_1',
        order: 1,
        title: '第1集',
        summary: 'logline',
        outline: null,
        coreExpression: null,
        contextCache: null,
        workflowState: 'IDLE',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ] as any);

    useEpisodeStore.getState().loadEpisodes('proj_1');
    await new Promise((r) => setTimeout(r, 0));

    expect(apiListEpisodes).toHaveBeenCalledWith('proj_1');
    expect(useEpisodeStore.getState().episodes).toHaveLength(1);
    expect(useEpisodeStore.getState().currentEpisodeId).toBe('ep_1');
  });

  it('createEpisode 应追加并排序 episodes', async () => {
    vi.mocked(apiCreateEpisode).mockResolvedValue({
      id: 'ep_2',
      projectId: 'proj_1',
      order: 2,
      title: '',
      summary: '',
      outline: null,
      coreExpression: null,
      contextCache: null,
      workflowState: 'IDLE',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    } as any);

    const created = await useEpisodeStore.getState().createEpisode('proj_1', { order: 2 });
    expect(created.id).toBe('ep_2');
    expect(useEpisodeStore.getState().episodes.map((e) => e.id)).toEqual(['ep_2']);
    expect(useEpisodeStore.getState().currentEpisodeId).toBe('ep_2');
  });

  it('updateEpisode 应更新并排序 episodes', async () => {
    useEpisodeStore.setState({
      episodes: [
        {
          id: 'ep_1',
          projectId: 'proj_1',
          order: 1,
          title: '旧标题',
          summary: '旧概要',
          outline: null,
          coreExpression: null,
          contextCache: null,
          workflowState: 'IDLE',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ] as any,
    } as any);

    vi.mocked(apiUpdateEpisode).mockResolvedValue({
      ...useEpisodeStore.getState().episodes[0],
      title: '新标题',
    } as any);

    const updated = await useEpisodeStore
      .getState()
      .updateEpisode('proj_1', 'ep_1', { title: '新标题' } as any);
    expect(updated.title).toBe('新标题');
    expect(useEpisodeStore.getState().episodes[0].title).toBe('新标题');
  });

  it('deleteEpisode 应移除 episode 并更新 currentEpisodeId', async () => {
    useEpisodeStore.setState({
      episodes: [
        {
          id: 'ep_1',
          projectId: 'proj_1',
          order: 1,
          title: 'A',
          summary: '',
          outline: null,
          coreExpression: null,
          contextCache: null,
          workflowState: 'IDLE',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'ep_2',
          projectId: 'proj_1',
          order: 2,
          title: 'B',
          summary: '',
          outline: null,
          coreExpression: null,
          contextCache: null,
          workflowState: 'IDLE',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ] as any,
      currentEpisodeId: 'ep_1',
    } as any);

    vi.mocked(apiDeleteEpisode).mockResolvedValue({ ok: true } as any);

    await useEpisodeStore.getState().deleteEpisode('proj_1', 'ep_1');
    expect(apiDeleteEpisode).toHaveBeenCalledWith('proj_1', 'ep_1');
    expect(useEpisodeStore.getState().episodes.map((e) => e.id)).toEqual(['ep_2']);
    expect(useEpisodeStore.getState().currentEpisodeId).toBe('ep_2');
  });

  it('planEpisodes 应入队并等待 job 完成', async () => {
    vi.mocked(apiWorkflowPlanEpisodes).mockResolvedValue({
      id: 'job_1',
      type: 'plan_episodes',
      status: 'queued',
      error: null,
      result: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    } as any);
    vi.mocked(apiWaitForAIJob).mockResolvedValue({ status: 'succeeded' } as any);
    vi.mocked(apiListEpisodes).mockResolvedValue([] as any);

    await useEpisodeStore.getState().planEpisodes({ projectId: 'proj_1', aiProfileId: 'aip_1' });
    expect(apiWorkflowPlanEpisodes).toHaveBeenCalledWith({
      projectId: 'proj_1',
      aiProfileId: 'aip_1',
    });
    expect(apiWaitForAIJob).toHaveBeenCalledWith('job_1');
    await new Promise((r) => setTimeout(r, 0));
    expect(apiListEpisodes).toHaveBeenCalledWith('proj_1');
    expect(useEpisodeStore.getState().isRunningWorkflow).toBe(false);
  });

  it('generateCoreExpression 应入队并等待 job 完成', async () => {
    vi.mocked(apiWorkflowGenerateEpisodeCoreExpression).mockResolvedValue({
      id: 'job_2',
      type: 'generate_episode_core_expression',
      status: 'queued',
      error: null,
      result: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    } as any);
    vi.mocked(apiWaitForAIJob).mockResolvedValue({ status: 'succeeded' } as any);
    vi.mocked(apiListEpisodes).mockResolvedValue([] as any);

    await useEpisodeStore.getState().generateCoreExpression({
      projectId: 'proj_1',
      episodeId: 'ep_1',
      aiProfileId: 'aip_1',
    });
    expect(apiWorkflowGenerateEpisodeCoreExpression).toHaveBeenCalledWith({
      projectId: 'proj_1',
      episodeId: 'ep_1',
      aiProfileId: 'aip_1',
    });
    expect(apiWaitForAIJob).toHaveBeenCalledWith('job_2');
  });

  it('generateSceneList 应入队并等待 job 完成', async () => {
    vi.mocked(apiWorkflowGenerateEpisodeSceneList).mockResolvedValue({
      id: 'job_3',
      type: 'generate_episode_scene_list',
      status: 'queued',
      error: null,
      result: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    } as any);
    vi.mocked(apiWaitForAIJob).mockResolvedValue({ status: 'succeeded' } as any);
    vi.mocked(apiListEpisodes).mockResolvedValue([] as any);

    await useEpisodeStore.getState().generateSceneList({
      projectId: 'proj_1',
      episodeId: 'ep_1',
      aiProfileId: 'aip_1',
      sceneCountHint: 12,
    });
    expect(apiWorkflowGenerateEpisodeSceneList).toHaveBeenCalledWith({
      projectId: 'proj_1',
      episodeId: 'ep_1',
      aiProfileId: 'aip_1',
      sceneCountHint: 12,
    });
    expect(apiWaitForAIJob).toHaveBeenCalledWith('job_3');
  });
});
