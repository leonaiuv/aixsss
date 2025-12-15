import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/runtime/mode', () => ({ isApiMode: () => true }));

vi.mock('@/lib/api/episodeScenes', () => ({
  apiListEpisodeScenes: vi.fn(),
  apiCreateEpisodeScene: vi.fn(),
  apiDeleteEpisodeScene: vi.fn(),
  apiReorderEpisodeScenes: vi.fn(),
}));

vi.mock('@/lib/api/episodeScenePatchQueue', () => ({
  queueApiEpisodeScenePatch: vi.fn(),
}));

import { useEpisodeScenesStore } from './episodeScenesStore';
import {
  apiListEpisodeScenes,
  apiCreateEpisodeScene,
  apiDeleteEpisodeScene,
  apiReorderEpisodeScenes,
} from '@/lib/api/episodeScenes';
import { queueApiEpisodeScenePatch } from '@/lib/api/episodeScenePatchQueue';

describe('episodeScenesStore (api)', () => {
  beforeEach(() => {
    useEpisodeScenesStore.setState({ scenes: [], isLoading: false, error: null });
    vi.clearAllMocks();
  });

  it('loadScenes 应加载分镜列表', async () => {
    vi.mocked(apiListEpisodeScenes).mockResolvedValue([
      {
        id: 's_1',
        projectId: 'proj_1',
        episodeId: 'ep_1',
        order: 1,
        summary: '分镜1',
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      },
    ] as any);

    useEpisodeScenesStore.getState().loadScenes('proj_1', 'ep_1');
    await new Promise((r) => setTimeout(r, 0));

    expect(apiListEpisodeScenes).toHaveBeenCalledWith('proj_1', 'ep_1');
    expect(useEpisodeScenesStore.getState().scenes).toHaveLength(1);
    expect(useEpisodeScenesStore.getState().scenes[0].id).toBe('s_1');
  });

  it('updateScene 应更新本地 state 并入队 patch', () => {
    useEpisodeScenesStore.setState({
      scenes: [
        {
          id: 's_1',
          projectId: 'proj_1',
          episodeId: 'ep_1',
          order: 1,
          summary: 'old',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        },
      ] as any,
    } as any);

    useEpisodeScenesStore.getState().updateScene('proj_1', 'ep_1', 's_1', { summary: 'new' } as any);
    expect(useEpisodeScenesStore.getState().scenes[0].summary).toBe('new');
    expect(queueApiEpisodeScenePatch).toHaveBeenCalledWith('proj_1', 'ep_1', 's_1', { summary: 'new' });
  });

  it('addScene 应调用创建 API 并追加到列表', async () => {
    vi.mocked(apiCreateEpisodeScene).mockResolvedValue({
      id: 's_new',
      projectId: 'proj_1',
      episodeId: 'ep_1',
      order: 1,
      summary: '新分镜',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
    } as any);

    const created = await useEpisodeScenesStore.getState().addScene('proj_1', 'ep_1', {
      projectId: 'proj_1',
      episodeId: 'ep_1',
      order: 1,
      summary: '新分镜',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
    } as any);

    expect(created.id).toBe('s_new');
    expect(apiCreateEpisodeScene).toHaveBeenCalled();
    expect(useEpisodeScenesStore.getState().scenes.map((s) => s.id)).toEqual(['s_new']);
  });

  it('deleteScene 应调用删除 API 并触发 reorder', async () => {
    useEpisodeScenesStore.setState({
      scenes: [
        {
          id: 's_1',
          projectId: 'proj_1',
          episodeId: 'ep_1',
          order: 1,
          summary: '1',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        },
        {
          id: 's_2',
          projectId: 'proj_1',
          episodeId: 'ep_1',
          order: 2,
          summary: '2',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          status: 'pending',
          notes: '',
        },
      ] as any,
    } as any);

    vi.mocked(apiDeleteEpisodeScene).mockResolvedValue({ ok: true } as any);
    vi.mocked(apiReorderEpisodeScenes).mockResolvedValue([] as any);

    await useEpisodeScenesStore.getState().deleteScene('proj_1', 'ep_1', 's_1');
    expect(apiDeleteEpisodeScene).toHaveBeenCalledWith('proj_1', 'ep_1', 's_1');
    expect(useEpisodeScenesStore.getState().scenes.map((s) => [s.id, s.order])).toEqual([['s_2', 1]]);
    await new Promise((r) => setTimeout(r, 0));
    expect(apiReorderEpisodeScenes).toHaveBeenCalledWith('proj_1', 'ep_1', ['s_2']);
  });
});

