import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowWorkbench } from './WorkflowWorkbench';
import type { Episode, Project } from '@/types';

function makeProject(): Project {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'proj_1',
    title: '测试项目',
    summary: '这是一个用于测试工作台的项目。',
    style: 'anime',
    protagonist: '测试主角',
    workflowState: 'IDLE',
    currentSceneOrder: 0,
    createdAt: now,
    updatedAt: now,
    contextCache: {
      emotionArc: [{ beat: '开场', value: 1 }],
    },
  };
}

function makeEpisode(): Episode {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'ep_1',
    projectId: 'proj_1',
    order: 1,
    title: '第一集',
    summary: '测试',
    outline: null,
    coreExpression: { theme: '测试主题' },
    contextCache: null,
    workflowState: 'SCENE_LIST_EDITING',
    createdAt: now,
    updatedAt: now,
  };
}

describe('WorkflowWorkbench', () => {
  it('应渲染专业工作流快捷操作并触发回调', async () => {
    const onRunGenerateSceneScript = vi.fn();
    const onRunGenerateEmotionArc = vi.fn();
    const onRunGenerateCharacterRelationships = vi.fn();

    render(
      <WorkflowWorkbench
        project={makeProject()}
        styleFullPrompt="anime style"
        characters={[]}
        worldViewElements={[]}
        episodes={[makeEpisode()]}
        currentEpisode={makeEpisode()}
        currentEpisodeScenes={[]}
        aiProfileId="aip_1"
        onGoToStep={vi.fn()}
        onRunPlanEpisodes={vi.fn()}
        onRunGenerateCoreExpression={vi.fn()}
        onRunGenerateSceneScript={onRunGenerateSceneScript}
        onRunGenerateSceneList={vi.fn()}
        onRunGenerateEmotionArc={onRunGenerateEmotionArc}
        onRunGenerateCharacterRelationships={onRunGenerateCharacterRelationships}
        onRunBatchRefineAll={vi.fn()}
        onSetProjectArtifactStatus={vi.fn()}
        onSetEpisodeArtifactStatus={vi.fn()}
      />,
    );

    expect(screen.getByText('专业工作流快捷操作')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /分场脚本/i }));
    await userEvent.click(screen.getByRole('button', { name: /情绪弧线/i }));
    await userEvent.click(screen.getByRole('button', { name: /角色关系图谱/i }));

    expect(onRunGenerateSceneScript).toHaveBeenCalledTimes(1);
    expect(onRunGenerateEmotionArc).toHaveBeenCalledTimes(1);
    expect(onRunGenerateCharacterRelationships).toHaveBeenCalledTimes(1);
  });
});
