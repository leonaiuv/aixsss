import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkflowWorkbench, type WorkflowAgentRunSummary } from './WorkflowWorkbench';

function createBaseProps() {
  return {
    project: null,
    styleFullPrompt: '',
    characters: [],
    worldViewElements: [],
    episodes: [],
    currentEpisode: null,
    currentEpisodeScenes: [],
    aiProfileId: 'aip_1',
    onGoToStep: vi.fn(),
    onGoToScene: vi.fn(),
    onRunPlanEpisodes: vi.fn(),
    onRunGenerateCoreExpression: vi.fn(),
    onRunGenerateSceneScript: vi.fn(),
    onRunGenerateSceneList: vi.fn(),
    onRunWorkflowSupervisor: vi.fn(),
    onRunGenerateEmotionArc: vi.fn(),
    onRunGenerateCharacterRelationships: vi.fn(),
    onRunBatchRefineAll: vi.fn(),
    onSetProjectArtifactStatus: vi.fn(),
    onSetEpisodeArtifactStatus: vi.fn(),
  } as const;
}

describe('WorkflowWorkbench agent status panel', () => {
  it('renders step-level summaries when agentRunSummary is provided', () => {
    const summary: WorkflowAgentRunSummary = {
      executionMode: 'legacy',
      fallbackUsed: true,
      finishedAt: '2026-02-10T12:00:00.000Z',
      stepSummaries: [
        {
          step: 'character_expansion',
          status: 'succeeded',
          message: 'ok',
          executionMode: 'agent',
          fallbackUsed: false,
        },
        {
          step: 'narrative_phase3',
          status: 'failed',
          message: 'phase3 timeout',
          executionMode: 'legacy',
          fallbackUsed: true,
        },
      ],
    };

    render(<WorkflowWorkbench {...createBaseProps()} agentRunSummary={summary} />);

    expect(screen.getByText('Agent 执行状态')).toBeInTheDocument();
    expect(screen.getByText('执行模式：Legacy')).toBeInTheDocument();
    expect(screen.getByText('自动降级：是')).toBeInTheDocument();
    expect(screen.getByText('角色体系扩充')).toBeInTheDocument();
    expect(screen.getByText('叙事因果链 Phase3')).toBeInTheDocument();
    expect(screen.getByText('phase3 timeout')).toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('shows running indicator when supervisor is executing', () => {
    render(<WorkflowWorkbench {...createBaseProps()} isRunningWorkflowSupervisor />);

    expect(screen.getByText('Agent 执行状态')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('renders scene child task stats and failed details when provided', () => {
    const summary: WorkflowAgentRunSummary = {
      executionMode: 'agent',
      fallbackUsed: false,
      finishedAt: '2026-02-11T08:00:00.000Z',
      stepSummaries: [],
      sceneChildTasks: [
        { sceneId: 's1', order: 1, jobId: 'job_scene_1', status: 'succeeded' },
        { sceneId: 's2', order: 2, jobId: 'job_scene_2', status: 'running' },
        {
          sceneId: 's3',
          order: 3,
          jobId: 'job_scene_3',
          status: 'failed',
          error: 'scene 3 failed',
        },
        {
          sceneId: 's4',
          order: 4,
          jobId: 'job_scene_4',
          status: 'cancelled',
          error: 'scene 4 cancelled',
        },
      ],
    };

    render(<WorkflowWorkbench {...createBaseProps()} agentRunSummary={summary} />);

    expect(screen.getByText('分镜子任务')).toBeInTheDocument();
    expect(screen.getByText('总计 4')).toBeInTheDocument();
    expect(screen.getByText('执行中 1')).toBeInTheDocument();
    expect(screen.getByText('失败 1')).toBeInTheDocument();
    expect(screen.getByText('取消 1')).toBeInTheDocument();
    expect(screen.getByText(/分镜 #3 · job_scene_3/)).toBeInTheDocument();
    expect(screen.getByText('scene 3 failed')).toBeInTheDocument();
    expect(screen.getByText(/分镜 #4 · job_scene_4/)).toBeInTheDocument();
    expect(screen.getByText('scene 4 cancelled')).toBeInTheDocument();
  });
});
