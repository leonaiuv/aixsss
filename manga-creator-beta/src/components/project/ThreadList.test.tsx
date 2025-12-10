import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThreadList } from './ThreadList';
import { resetMemoryCheckpointStore, getMemoryCheckpointStore } from '@/lib/checkpoint/store';
import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore } from '@/stores/canvasStore';

describe('ThreadList', () => {
  beforeEach(() => {
    // 重置所有 stores
    resetMemoryCheckpointStore();
    useProjectStore.getState().reset();
    useCanvasStore.getState().reset();
  });

  it('应该显示加载状态', () => {
    render(<ThreadList />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('应该显示空状态', async () => {
    render(<ThreadList />);
    
    await waitFor(() => {
      expect(screen.getByText('暂无项目')).toBeInTheDocument();
    });
  });

  it('应该显示项目列表', async () => {
    // 准备测试数据
    const store = getMemoryCheckpointStore();
    await store.save({
      projectId: 'proj-1',
      threadId: 'thread-1',
      workflowState: 'GENERATING_SCENES',
      title: '测试漫画项目',
      summary: '这是一个测试',
      artStyle: '日式',
      protagonist: '小明',
      scenes: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });

    render(<ThreadList />);

    await waitFor(() => {
      expect(screen.getByText('测试漫画项目')).toBeInTheDocument();
    });
    
    expect(screen.getByText('共 1 个项目')).toBeInTheDocument();
  });

  it('应该能够选择项目', async () => {
    // 准备测试数据
    const store = getMemoryCheckpointStore();
    await store.save({
      projectId: 'proj-select',
      threadId: 'thread-1',
      workflowState: 'IDLE',
      title: '可选项目',
      summary: '',
      artStyle: '',
      protagonist: '',
      scenes: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });

    const onProjectSelect = vi.fn();
    render(<ThreadList onProjectSelect={onProjectSelect} />);

    await waitFor(() => {
      expect(screen.getByText('可选项目')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('可选项目'));

    await waitFor(() => {
      expect(onProjectSelect).toHaveBeenCalledWith('proj-select');
    });
  });

  it('应该显示新建按钮并触发回调', async () => {
    const onNewProject = vi.fn();
    render(<ThreadList onNewProject={onNewProject} />);

    await waitFor(() => {
      expect(screen.getByText('新建')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('新建'));
    expect(onNewProject).toHaveBeenCalled();
  });
});
