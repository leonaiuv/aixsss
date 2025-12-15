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

    mockUseProjectStore.mockImplementation(((selector: any) => {
      return typeof selector === 'function' ? selector(projectState) : projectState;
    }) as any);

    mockUseConfigStore.mockReturnValue({ config: { aiProfileId: 'aip_1' } } as any);
    mockUseCharacterStore.mockReturnValue({ characters: [], loadCharacters: vi.fn() } as any);
    mockUseWorldViewStore.mockReturnValue({ elements: [], loadElements: vi.fn() } as any);

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
    } as any);

    mockUseEpisodeScenesStore.mockReturnValue({
      scenes: [],
      isLoading: false,
      error: null,
      loadScenes: vi.fn(),
      updateScene: vi.fn(),
      deleteScene: vi.fn(),
      setScenes: vi.fn(),
    } as any);
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
});
