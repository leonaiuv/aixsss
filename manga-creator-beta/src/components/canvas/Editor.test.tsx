import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Editor } from './Editor';

// Mock BlockNote 模块
vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => ({
    document: [],
    replaceBlocks: vi.fn(),
  }),
  createReactBlockSpec: () => () => ({
    config: {},
    implementation: {},
  }),
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ editor }: { editor: unknown }) => (
    <div data-testid="blocknote-view">BlockNote Editor Mock</div>
  ),
}));

vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: {
    create: () => ({}),
  },
  defaultBlockSpecs: {},
}));

// Mock canvasStore
vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: () => ({
    blocks: [],
    markSynced: vi.fn(),
  }),
}));

describe('Editor', () => {
  it('应该渲染编辑器容器', () => {
    render(<Editor />);
    expect(screen.getByTestId('blocknote-view')).toBeInTheDocument();
  });

  it('应该渲染编辑器标题', () => {
    render(<Editor />);
    expect(screen.getByText('创作画布')).toBeInTheDocument();
  });
});
