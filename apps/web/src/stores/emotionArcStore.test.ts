import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/types';

vi.mock('@/lib/runtime/mode', () => ({ isApiMode: () => true }));

vi.mock('@/lib/api/workflow', () => ({
  apiWorkflowGenerateEmotionArc: vi.fn(),
}));

vi.mock('@/lib/api/aiJobs', () => ({
  apiWaitForAIJob: vi.fn(),
}));

vi.mock('@/lib/api/projects', () => ({
  apiGetProject: vi.fn(),
}));

import { useEmotionArcStore } from './emotionArcStore';
import { apiWorkflowGenerateEmotionArc } from '@/lib/api/workflow';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import { apiGetProject } from '@/lib/api/projects';

describe('emotionArcStore (api)', () => {
  beforeEach(() => {
    useEmotionArcStore.setState({
      emotionArc: [],
      isLoading: false,
      isGenerating: false,
      lastJobId: null,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('loadFromProject 应从 contextCache 读取 emotionArc', () => {
    const project = {
      id: 'proj_1',
      contextCache: {
        emotionArc: [
          { beat: '开场', value: -2, note: '压抑' },
          { beat: '反转', value: 6, note: '释放' },
        ],
      },
    } as unknown as Project;

    useEmotionArcStore.getState().loadFromProject(project);

    expect(useEmotionArcStore.getState().emotionArc).toHaveLength(2);
    expect(useEmotionArcStore.getState().emotionArc[1].value).toBe(6);
  });

  it('generateEmotionArc 应入队并刷新最新项目数据', async () => {
    vi.mocked(apiWorkflowGenerateEmotionArc).mockResolvedValue({
      id: 'job_emotion_1',
      type: 'generate_emotion_arc',
      status: 'queued',
      error: null,
      result: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    } as Awaited<ReturnType<typeof apiWorkflowGenerateEmotionArc>>);

    vi.mocked(apiWaitForAIJob).mockResolvedValue({
      id: 'job_emotion_1',
      status: 'succeeded',
      result: null,
      progress: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: '2026-01-01T00:00:01.000Z',
      type: 'generate_emotion_arc',
      error: null,
      teamId: 'team_1',
      projectId: 'proj_1',
      sceneId: null,
      episodeId: null,
      aiProfileId: 'aip_1',
      cancelRequested: false,
    } as Awaited<ReturnType<typeof apiWaitForAIJob>>);

    vi.mocked(apiGetProject).mockResolvedValue({
      id: 'proj_1',
      contextCache: {
        emotionArc: [
          { beat: '低谷', value: -7, note: '失去希望' },
          { beat: '高潮', value: 9, note: '完成自我和解' },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof apiGetProject>>);

    await useEmotionArcStore.getState().generateEmotionArc({
      projectId: 'proj_1',
      aiProfileId: 'aip_1',
    });

    expect(apiWorkflowGenerateEmotionArc).toHaveBeenCalledWith({
      projectId: 'proj_1',
      aiProfileId: 'aip_1',
    });
    expect(apiWaitForAIJob).toHaveBeenCalledWith('job_emotion_1', expect.any(Object));
    expect(apiGetProject).toHaveBeenCalledWith('proj_1');
    expect(useEmotionArcStore.getState().emotionArc).toHaveLength(2);
    expect(useEmotionArcStore.getState().emotionArc[0].beat).toBe('低谷');
  });
});
