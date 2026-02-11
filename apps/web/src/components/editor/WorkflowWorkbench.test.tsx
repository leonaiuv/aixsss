import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  WorkflowWorkbench,
  type WorkflowAgentRunSummary,
} from './WorkflowWorkbench';

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

    render(
      <WorkflowWorkbench
        {...createBaseProps()}
        agentRunSummary={summary}
      />,
    );

    expect(screen.getByText('Agent 执行状态')).toBeInTheDocument();
    expect(screen.getByText('执行模式：Legacy')).toBeInTheDocument();
    expect(screen.getByText('自动降级：是')).toBeInTheDocument();
    expect(screen.getByText('角色体系扩充')).toBeInTheDocument();
    expect(screen.getByText('叙事因果链 Phase3')).toBeInTheDocument();
    expect(screen.getByText('phase3 timeout')).toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('shows running indicator when supervisor is executing', () => {
    render(
      <WorkflowWorkbench
        {...createBaseProps()}
        isRunningWorkflowSupervisor
      />,
    );

    expect(screen.getByText('Agent 执行状态')).toBeInTheDocument();
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });
});
