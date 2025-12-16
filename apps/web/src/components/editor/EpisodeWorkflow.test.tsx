import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EpisodeWorkflow } from './EpisodeWorkflow';

vi.mock('./BasicSettings', () => ({
  BasicSettings: () => <div data-testid="basic-settings">BasicSettings</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/stores/projectStore', () => ({ useProjectStore: vi.fn() }));
vi.mock('@/stores/configStore', () => ({ useConfigStore: vi.fn() }));
vi.mock('@/stores/characterStore', () => ({ useCharacterStore: vi.fn() }));
vi.mock('@/stores/worldViewStore', () => ({ useWorldViewStore: vi.fn() }));
vi.mock('@/stores/episodeStore', () => ({ useEpisodeStore: vi.fn() }));
vi.mock('@/stores/episodeScenesStore', () => ({ useEpisodeScenesStore: vi.fn() }));

import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { useEpisodeScenesStore } from '@/stores/episodeScenesStore';

const mockUseProjectStore = vi.mocked(useProjectStore);
const mockUseConfigStore = vi.mocked(useConfigStore);
const mockUseCharacterStore = vi.mocked(useCharacterStore);
const mockUseWorldViewStore = vi.mocked(useWorldViewStore);
const mockUseEpisodeStore = vi.mocked(useEpisodeStore);
const mockUseEpisodeScenesStore = vi.mocked(useEpisodeScenesStore);

describe('EpisodeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const projectState = {
      currentProject: {
        id: 'proj_1',
        title: '测试项目',
        summary: 'x'.repeat(120),
        style: 'anime',
        protagonist: '主角设定',
        workflowState: 'EPISODE_PLAN_EDITING',
        currentSceneOrder: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    };

    mockUseProjectStore.mockImplementation(((
      selector?: (state: typeof projectState) => unknown,
    ) => {
      return typeof selector === 'function' ? selector(projectState) : projectState;
    }) as unknown as typeof useProjectStore);

    mockUseConfigStore.mockReturnValue({ config: { aiProfileId: 'aip_1' } } as ReturnType<
      typeof useConfigStore
    >);
    mockUseCharacterStore.mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
    } as ReturnType<typeof useCharacterStore>);
    mockUseWorldViewStore.mockReturnValue({
      elements: [],
      loadElements: vi.fn(),
    } as ReturnType<typeof useWorldViewStore>);

    mockUseEpisodeStore.mockReturnValue({
      episodes: [],
      currentEpisodeId: null,
      isLoading: false,
      isRunningWorkflow: false,
      lastJobId: null,
      error: null,
      loadEpisodes: vi.fn(),
      setCurrentEpisode: vi.fn(),
      updateEpisode: vi.fn(),
      planEpisodes: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateSceneList: vi.fn(),
      createEpisode: vi.fn(),
      deleteEpisode: vi.fn(),
    } as ReturnType<typeof useEpisodeStore>);

    mockUseEpisodeScenesStore.mockReturnValue({
      scenes: [],
      isLoading: false,
      error: null,
      loadScenes: vi.fn(),
      updateScene: vi.fn(),
      deleteScene: vi.fn(),
      setScenes: vi.fn(),
    } as ReturnType<typeof useEpisodeScenesStore>);
  });

  it('应渲染左侧步骤导航', () => {
    render(<EpisodeWorkflow />);
    expect(screen.getByText('Episode 工作流')).toBeInTheDocument();
    expect(screen.getByText('全局设定')).toBeInTheDocument();
    expect(screen.getByText('剧集规划')).toBeInTheDocument();
    expect(screen.getByText('单集创作')).toBeInTheDocument();
    expect(screen.getByText('整合导出')).toBeInTheDocument();
  });

  it('点击步骤应切换到剧集规划面板', async () => {
    render(<EpisodeWorkflow />);

    await userEvent.click(screen.getByRole('button', { name: '剧集规划' }));
    expect(screen.getByRole('heading', { name: '剧集规划' })).toBeInTheDocument();
    expect(screen.getByText('Episodes（按集数排序）')).toBeInTheDocument();
  });

  it('场景锚点应支持复制 ZH/EN（仅复制纯提示词）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    mockUseEpisodeStore.mockReturnValue({
      episodes: [
        {
          id: 'ep_1',
          order: 1,
          title: '第一集',
          workflowState: 'SCENE_LIST_EDITING',
          coreExpression: { theme: 'test' },
        },
      ],
      currentEpisodeId: 'ep_1',
      isLoading: false,
      isRunningWorkflow: false,
      lastJobId: null,
      lastJobProgress: null,
      error: null,
      loadEpisodes: vi.fn(),
      setCurrentEpisode: vi.fn(),
      updateEpisode: vi.fn(),
      planEpisodes: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateSceneList: vi.fn(),
      createEpisode: vi.fn(),
      deleteEpisode: vi.fn(),
    } as ReturnType<typeof useEpisodeStore>);

    mockUseEpisodeScenesStore.mockReturnValue({
      scenes: [
        {
          id: 'scene_1',
          order: 1,
          status: 'done',
          summary: '测试分镜概要',
          sceneDescription: [
            'SCENE_ANCHOR_ZH: 测试场景锚点中文',
            'SCENE_ANCHOR_EN: test scene anchor english',
            'LOCK_ZH: 1) 锚点A; 2) 锚点B',
            'LOCK_EN: 1) anchor A; 2) anchor B',
            'AVOID_ZH: 不要人物，不要文字',
            'AVOID_EN: no people, no text',
          ].join('\n'),
          shotPrompt: '',
          motionPrompt: '',
          dialogues: [],
          notes: '',
        },
      ],
      isLoading: false,
      error: null,
      loadScenes: vi.fn(),
      updateScene: vi.fn(),
      deleteScene: vi.fn(),
      setScenes: vi.fn(),
    } as ReturnType<typeof useEpisodeScenesStore>);

    render(<EpisodeWorkflow />);

    await userEvent.click(screen.getByRole('button', { name: '单集创作' }));
    await userEvent.click(screen.getByRole('tab', { name: '分镜列表' }));
    await userEvent.click(screen.getByRole('button', { name: '查看/编辑' }));

    expect(await screen.findByText('分镜详情（可编辑）')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '复制 ZH' }));
    await userEvent.click(screen.getByRole('button', { name: '复制 EN' }));

    // 复制内容应包含 SCENE_ANCHOR + LOCK + AVOID（纯文本，无标签）
    expect(writeText).toHaveBeenNthCalledWith(
      1,
      '测试场景锚点中文\n\n1) 锚点A; 2) 锚点B\n\n不要人物，不要文字',
    );
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      'test scene anchor english\n\n1) anchor A; 2) anchor B\n\nno people, no text',
    );
  });
});
