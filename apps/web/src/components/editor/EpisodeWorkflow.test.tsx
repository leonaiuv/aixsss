import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EpisodeWorkflow } from './EpisodeWorkflow';

const toastMock = vi.fn();

vi.mock('./BasicSettings', () => ({
  BasicSettings: () => <div data-testid="basic-settings">BasicSettings</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/runtime/mode', () => ({
  isApiMode: () => true,
}));

vi.mock('@/lib/api/workflow', () => ({
  apiWorkflowGenerateKeyframeImages: vi.fn(),
  apiWorkflowGenerateSceneVideo: vi.fn(),
  apiWorkflowGenerateStoryboardGroup: vi.fn(),
  apiWorkflowGenerateStoryboardPlan: vi.fn(),
  apiWorkflowGenerateStoryboardSceneBible: vi.fn(),
  apiWorkflowBackTranslateStoryboardPanels: vi.fn(),
  apiWorkflowTranslateStoryboardPanels: vi.fn(),
  apiWorkflowRefineAllScenes: vi.fn(),
  apiWorkflowRefineSceneAll: vi.fn(),
  apiWorkflowGenerateSceneScript: vi.fn(),
  apiWorkflowExpandStoryCharacters: vi.fn(),
  apiWorkflowRunSupervisor: vi.fn(),
  apiWorkflowRunEpisodeCreationAgent: vi.fn(),
  apiWorkflowGenerateSoundDesign: vi.fn(),
  apiWorkflowEstimateDuration: vi.fn(),
}));

vi.mock('@/lib/api/aiJobs', () => ({
  apiWaitForAIJob: vi.fn(),
  apiCancelAIJob: vi.fn(),
}));

vi.mock('@/stores/projectStore', () => ({ useProjectStore: vi.fn() }));
vi.mock('@/stores/configStore', () => ({ useConfigStore: vi.fn() }));
vi.mock('@/stores/characterStore', () => ({ useCharacterStore: vi.fn() }));
vi.mock('@/stores/worldViewStore', () => ({ useWorldViewStore: vi.fn() }));
vi.mock('@/stores/episodeStore', () => ({ useEpisodeStore: vi.fn() }));
vi.mock('@/stores/episodeScenesStore', () => ({ useEpisodeScenesStore: vi.fn() }));
vi.mock('@/stores/characterRelationshipStore', () => ({ useCharacterRelationshipStore: vi.fn() }));
vi.mock('@/stores/emotionArcStore', () => ({ useEmotionArcStore: vi.fn() }));

import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { useEpisodeScenesStore } from '@/stores/episodeScenesStore';
import { useCharacterRelationshipStore } from '@/stores/characterRelationshipStore';
import { useEmotionArcStore } from '@/stores/emotionArcStore';
import {
  apiWorkflowRunEpisodeCreationAgent,
} from '@/lib/api/workflow';
import { apiCancelAIJob, apiWaitForAIJob } from '@/lib/api/aiJobs';

const mockUseProjectStore = vi.mocked(useProjectStore);
const mockUseConfigStore = vi.mocked(useConfigStore);
const mockUseCharacterStore = vi.mocked(useCharacterStore);
const mockUseWorldViewStore = vi.mocked(useWorldViewStore);
const mockUseEpisodeStore = vi.mocked(useEpisodeStore);
const mockUseEpisodeScenesStore = vi.mocked(useEpisodeScenesStore);
const mockUseCharacterRelationshipStore = vi.mocked(useCharacterRelationshipStore);
const mockUseEmotionArcStore = vi.mocked(useEmotionArcStore);
const mockApiWorkflowRunEpisodeCreationAgent = vi.mocked(apiWorkflowRunEpisodeCreationAgent);
const mockApiWaitForAIJob = vi.mocked(apiWaitForAIJob);
const mockApiCancelAIJob = vi.mocked(apiCancelAIJob);
let updateProjectMock: ReturnType<typeof vi.fn>;
let addCharacterMock: ReturnType<typeof vi.fn>;

describe('EpisodeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockReset();
    updateProjectMock = vi.fn();
    addCharacterMock = vi.fn();
    mockApiWorkflowRunEpisodeCreationAgent.mockResolvedValue({ id: 'job_ep_agent_1' } as never);
    mockApiWaitForAIJob.mockResolvedValue({
      id: 'job_ep_agent_1',
      result: {
        executionMode: 'agent',
        fallbackUsed: false,
        stepSummaries: [],
      },
    } as never);
    mockApiCancelAIJob.mockResolvedValue({ ok: true } as never);

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
      updateProject: updateProjectMock,
    };

    mockUseProjectStore.mockImplementation(((
      selector?: (state: typeof projectState) => unknown,
    ) => {
      return typeof selector === 'function' ? selector(projectState) : projectState;
    }) as unknown as typeof useProjectStore);
    (mockUseProjectStore as unknown as { getState: () => { loadProject: ReturnType<typeof vi.fn> } }).getState =
      () => ({
        loadProject: vi.fn().mockResolvedValue(undefined),
      });

    mockUseConfigStore.mockReturnValue({ config: { aiProfileId: 'aip_1' } } as ReturnType<
      typeof useConfigStore
    >);
    mockUseCharacterStore.mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: addCharacterMock,
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
      buildNarrativeCausalChain: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateCoreExpressionBatch: vi.fn(),
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

    mockUseCharacterRelationshipStore.mockReturnValue({
      relationships: [],
      isLoading: false,
      isGenerating: false,
      lastJobId: null,
      error: null,
      loadRelationships: vi.fn(),
      createRelationship: vi.fn(),
      updateRelationship: vi.fn(),
      deleteRelationship: vi.fn(),
      generateRelationships: vi.fn(),
    } as ReturnType<typeof useCharacterRelationshipStore>);

    mockUseEmotionArcStore.mockReturnValue({
      emotionArc: [],
      isLoading: false,
      isGenerating: false,
      lastJobId: null,
      error: null,
      loadFromProject: vi.fn(),
      syncFromApi: vi.fn(),
      generateEmotionArc: vi.fn(),
    } as ReturnType<typeof useEmotionArcStore>);
  });

  it('应渲染左侧步骤导航', () => {
    render(<EpisodeWorkflow />);
    expect(screen.getAllByText('工作台').length).toBeGreaterThan(0);
    expect(screen.getByText('全局设定')).toBeInTheDocument();
    expect(screen.getByText('因果链')).toBeInTheDocument();
    expect(screen.getByText('剧集规划')).toBeInTheDocument();
    expect(screen.getByText('单集创作')).toBeInTheDocument();
    expect(screen.getByText('导出')).toBeInTheDocument();
  });

  it('点击步骤应切换到剧集规划面板', async () => {
    render(<EpisodeWorkflow />);

    await userEvent.click(screen.getByText('剧集规划'));
    expect(screen.getByText('剧集规划中心')).toBeInTheDocument();
  });

  it('因果链面板应展示“丰满角色体系”按钮', async () => {
    render(<EpisodeWorkflow />);

    await userEvent.click(screen.getByText('因果链'));
    expect(screen.getByRole('button', { name: '丰满角色体系' })).toBeInTheDocument();
  });

  it('单集创作应展示 5 个工作流标签', async () => {
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
      buildNarrativeCausalChain: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateCoreExpressionBatch: vi.fn(),
      generateSceneList: vi.fn(),
      createEpisode: vi.fn(),
      deleteEpisode: vi.fn(),
    } as ReturnType<typeof useEpisodeStore>);

    render(<EpisodeWorkflow />);

    await userEvent.click(screen.getByText('单集创作'));

    expect(screen.getByRole('tab', { name: '1. 核心表达' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2. 分场脚本' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3. 分镜列表' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '4. 分镜细化' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '5. 声音与时长' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI代理一键生成5步' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消当前任务' })).toBeInTheDocument();
  });

  it('单集创作 Agent 冲突时应提示“取消并重试”并可触发重试', async () => {
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
      buildNarrativeCausalChain: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateCoreExpressionBatch: vi.fn(),
      generateSceneList: vi.fn(),
      createEpisode: vi.fn(),
      deleteEpisode: vi.fn(),
    } as ReturnType<typeof useEpisodeStore>);

    mockApiWorkflowRunEpisodeCreationAgent
      .mockRejectedValueOnce(
        new Error(
          'Episode creation is already running with another job (run_episode_creation_agent:job_old_1)',
        ),
      )
      .mockResolvedValueOnce({ id: 'job_new_1' } as never);

    render(<EpisodeWorkflow />);
    await userEvent.click(screen.getByText('单集创作'));
    await userEvent.click(screen.getByRole('button', { name: 'AI代理一键生成5步' }));

    const conflictToastCall = toastMock.mock.calls.find(
      (call) => call?.[0]?.title === '已有任务进行中',
    );
    expect(conflictToastCall).toBeTruthy();
    const action = conflictToastCall?.[0]?.action;
    expect(action).toBeTruthy();

    action.props.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApiCancelAIJob).toHaveBeenCalledWith('job_old_1');
    expect(mockApiWorkflowRunEpisodeCreationAgent).toHaveBeenCalledTimes(2);
  });

  it('单集创作 Agent 应自动跟随 nextJobId 续跑直到完成', async () => {
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
      buildNarrativeCausalChain: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateCoreExpressionBatch: vi.fn(),
      generateSceneList: vi.fn(),
      createEpisode: vi.fn(),
      deleteEpisode: vi.fn(),
    } as ReturnType<typeof useEpisodeStore>);

    mockApiWorkflowRunEpisodeCreationAgent.mockResolvedValueOnce({ id: 'job_ep_agent_1' } as never);
    mockApiWaitForAIJob
      .mockResolvedValueOnce({
        id: 'job_ep_agent_1',
        result: {
          executionMode: 'agent',
          fallbackUsed: false,
          continued: true,
          nextJobId: 'job_ep_agent_2',
          stepSummaries: [
            {
              step: 'scene_refinement',
              status: 'succeeded',
              message: 'chunk 1',
              chunk: 1,
              sourceJobId: 'job_ep_agent_1',
            },
          ],
          sceneChildTasks: [
            {
              sceneId: 's1',
              order: 1,
              jobId: 'job_scene_1',
              status: 'running',
            },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        id: 'job_ep_agent_2',
        result: {
          executionMode: 'agent',
          fallbackUsed: false,
          continued: false,
          stepSummaries: [
            {
              step: 'sound_and_duration',
              status: 'succeeded',
              message: 'done',
              chunk: 2,
              sourceJobId: 'job_ep_agent_2',
            },
          ],
          sceneChildTasks: [
            {
              sceneId: 's1',
              order: 1,
              jobId: 'job_scene_1',
              status: 'succeeded',
            },
            {
              sceneId: 's2',
              order: 2,
              jobId: 'job_scene_2',
              status: 'failed',
              error: 'scene child task failed',
            },
          ],
        },
      } as never);

    render(<EpisodeWorkflow />);
    await userEvent.click(screen.getByText('单集创作'));
    await userEvent.click(screen.getByRole('button', { name: 'AI代理一键生成5步' }));

    expect(mockApiWaitForAIJob).toHaveBeenNthCalledWith(
      1,
      'job_ep_agent_1',
      expect.objectContaining({ timeoutMs: 30 * 60_000 }),
    );
    expect(mockApiWaitForAIJob).toHaveBeenNthCalledWith(
      2,
      'job_ep_agent_2',
      expect.objectContaining({ timeoutMs: 30 * 60_000 }),
    );
    expect(await screen.findByText('chunk 1')).toBeInTheDocument();
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(screen.getByText('分片 #1')).toBeInTheDocument();
    expect(screen.getAllByText('分片 #2').length).toBeGreaterThan(0);
    expect(screen.getByText('分镜子任务')).toBeInTheDocument();
    expect(screen.getByText(/job_scene_1/)).toBeInTheDocument();
    expect(screen.getByText(/job_scene_2/)).toBeInTheDocument();
    expect(screen.getByText('scene child task failed')).toBeInTheDocument();
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
      buildNarrativeCausalChain: vi.fn(),
      generateCoreExpression: vi.fn(),
      generateCoreExpressionBatch: vi.fn(),
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

    await userEvent.click(screen.getByText('单集创作'));
    await userEvent.click(screen.getByRole('tab', { name: '3. 分镜列表' }));
    await userEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText('分镜 #1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ZH' }));
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));

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

  it('导入角色后应从候选缓存移除已处理项，避免重复导入', async () => {
    const projectState = {
      currentProject: {
        id: 'proj_1',
        title: '测试项目',
        summary: 'x'.repeat(120),
        style: 'anime',
        protagonist: '主角设定',
        workflowState: 'EPISODE_PLAN_EDITING',
        currentSceneOrder: 0,
        contextCache: {
          characterExpansion: {
            runId: 'run_1',
            generatedAt: '2026-02-11T00:00:00.000Z',
            source: 'narrative_causal_chain',
            candidates: [
              {
                tempId: 'cand_1',
                name: '角色甲',
                aliases: [],
                roleType: 'supporting',
                briefDescription: '候选甲',
                appearance: '',
                personality: '',
                background: '',
                confidence: 0.9,
                evidence: [],
              },
              {
                tempId: 'cand_2',
                name: '角色乙',
                aliases: [],
                roleType: 'supporting',
                briefDescription: '候选乙',
                appearance: '',
                personality: '',
                background: '',
                confidence: 0.88,
                evidence: [],
              },
            ],
          },
        },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      updateProject: updateProjectMock,
    };

    mockUseProjectStore.mockImplementation(((
      selector?: (state: typeof projectState) => unknown,
    ) => {
      return typeof selector === 'function' ? selector(projectState) : projectState;
    }) as unknown as typeof useProjectStore);

    render(<EpisodeWorkflow />);
    await userEvent.click(screen.getByText('因果链'));
    await userEvent.click(screen.getByRole('button', { name: '导入选中角色' }));

    expect(addCharacterMock).toHaveBeenCalledTimes(2);
    expect(updateProjectMock).toHaveBeenCalledTimes(1);
    const payload = updateProjectMock.mock.calls[0]?.[1] as {
      contextCache?: { characterExpansion?: { candidates?: unknown[] } };
    };
    expect(payload.contextCache?.characterExpansion?.candidates ?? []).toHaveLength(0);
  });
});
