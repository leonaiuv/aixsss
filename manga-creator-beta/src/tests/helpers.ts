import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

/**
 * Custom render function that wraps components with necessary providers
 */
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  return render(ui, {
    ...options,
  });
};

export * from '@testing-library/react';
export { customRender as render };

/**
 * Create a mock project state for testing
 */
export function createMockProjectState(overrides = {}) {
  return {
    projectId: 'test-project-1',
    title: '测试项目',
    summary: '这是一个测试项目',
    artStyle: '赛博朋克',
    protagonist: '主角测试',
    workflowState: 'IDLE' as const,
    scenes: [],
    currentSceneIndex: 0,
    canvasContent: [],
    characters: [],
    ...overrides,
  };
}

/**
 * Create a mock scene for testing
 */
export function createMockScene(overrides = {}) {
  return {
    id: `scene-${Math.random().toString(36).substring(7)}`,
    order: 1,
    summary: '测试分镜',
    status: 'pending' as const,
    sceneDescription: '',
    keyframePrompt: '',
    spatialPrompt: '',
    dialogues: [],
    ...overrides,
  };
}

/**
 * Wait for a specified time
 */
export function waitFor(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
