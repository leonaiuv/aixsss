import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchOperations } from './BatchOperations';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Scene } from '@/types';

// 创建模拟场景数据
function createMockScenes(count: number): Scene[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${i + 1}`,
    projectId: 'project-1',
    order: i + 1,
    summary: `场景 ${i + 1} 概要`,
    sceneDescription: i % 2 === 0 ? `场景 ${i + 1} 描述` : '',
    shotPrompt: i % 3 === 0 ? `关键帧提示词 ${i + 1}` : '',
    motionPrompt: i % 4 === 0 ? `时空提示词 ${i + 1}` : '',
    dialogues: i === 0 ? [{ id: 'd1', type: 'dialogue' as const, content: '测试台词', characterName: '角色A' }] : [],
    status: i === 0 ? 'completed' : 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

describe('BatchOperations', () => {
  const mockOnBatchGenerate = vi.fn();
  const mockOnBatchEdit = vi.fn();
  const mockOnBatchExport = vi.fn();
  const mockOnBatchDelete = vi.fn();

  const defaultProps = {
    scenes: createMockScenes(5),
    onBatchGenerate: mockOnBatchGenerate,
    onBatchEdit: mockOnBatchEdit,
    onBatchExport: mockOnBatchExport,
    onBatchDelete: mockOnBatchDelete,
  };

  beforeEach(() => {
    // Reset store state
    useAIProgressStore.setState({
      tasks: [],
      activeTaskId: null,
      isQueuePaused: false,
      isBatchGenerating: false,
      batchGeneratingSource: null,
      batchOperations: {
        selectedScenes: new Set(),
        isProcessing: false,
        isPaused: false,
        progress: 0,
        currentScene: 0,
        totalScenes: 0,
        operationType: null,
        startTime: null,
        completedScenes: [],
        failedScenes: [],
        currentSceneId: null,
        statusMessage: '',
      },
      isPanelVisible: false,
      isPanelMinimized: false,
      filter: {},
      stats: {
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        totalTokensUsed: 0,
        costEstimate: 0,
      },
      listeners: new Map(),
    });
    vi.clearAllMocks();
  });

  describe('初始渲染', () => {
    it('应该正确渲染批量操作组件', () => {
      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('批量操作')).toBeInTheDocument();
      expect(screen.getByText('已选择 0 个分镜')).toBeInTheDocument();
    });

    it('应该显示所有分镜列表', () => {
      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('场景 1 概要')).toBeInTheDocument();
      expect(screen.getByText('场景 5 概要')).toBeInTheDocument();
    });

    it('应该显示分镜状态', () => {
      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('状态: 已完成')).toBeInTheDocument();
      expect(screen.getAllByText('状态: 待处理').length).toBeGreaterThan(0);
    });

    it('应该禁用批量生成按钮当未选择分镜时', () => {
      render(<BatchOperations {...defaultProps} />);

      const generateButton = screen.getByRole('button', { name: /批量生成/ });
      expect(generateButton).toBeDisabled();
    });
  });

  describe('分镜选择', () => {
    it('应该能够选择单个分镜', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      const firstScene = screen.getByText('场景 1 概要').closest('div[class*="cursor-pointer"]');
      if (firstScene) await user.click(firstScene);

      expect(screen.getByText('已选择 1 个分镜')).toBeInTheDocument();
    });

    it('应该能够全选所有分镜', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      const selectAllButton = screen.getByRole('button', { name: '全选' });
      await user.click(selectAllButton);

      expect(screen.getByText('已选择 5 个分镜')).toBeInTheDocument();
    });

    it('应该能够取消全选', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      // 先全选
      const selectAllButton = screen.getByRole('button', { name: '全选' });
      await user.click(selectAllButton);

      expect(screen.getByText('已选择 5 个分镜')).toBeInTheDocument();

      // 再取消全选
      const cancelAllButton = screen.getByRole('button', { name: '取消全选' });
      await user.click(cancelAllButton);

      expect(screen.getByText('已选择 0 个分镜')).toBeInTheDocument();
    });

    it('应该能够通过点击取消选择已选中的分镜', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      const firstScene = screen.getByText('场景 1 概要').closest('div[class*="cursor-pointer"]');
      if (firstScene) {
        // 选择
        await user.click(firstScene);
        expect(screen.getByText('已选择 1 个分镜')).toBeInTheDocument();

        // 取消选择
        await user.click(firstScene);
        expect(screen.getByText('已选择 0 个分镜')).toBeInTheDocument();
      }
    });

    it('应该能够选择多个分镜', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      const scenes = screen.getAllByText(/场景 \d 概要/);
      for (const scene of scenes.slice(0, 3)) {
        const sceneDiv = scene.closest('div[class*="cursor-pointer"]');
        if (sceneDiv) await user.click(sceneDiv);
      }

      expect(screen.getByText('已选择 3 个分镜')).toBeInTheDocument();
    });
  });

  describe('批量生成', () => {
    it('应该在选择分镜后启用批量生成按钮', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      // 全选
      await user.click(screen.getByRole('button', { name: '全选' }));

      const generateButton = screen.getByRole('button', { name: /批量生成/ });
      expect(generateButton).not.toBeDisabled();
    });

    it('应该在点击批量生成时调用回调函数', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '全选' }));
      await user.click(screen.getByRole('button', { name: /批量生成/ }));

      expect(mockOnBatchGenerate).toHaveBeenCalledWith(
        expect.arrayContaining(['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5']),
        expect.any(Object)
      );
    });

    it('应该在全局批量生成中禁用批量生成按钮', async () => {
      const user = userEvent.setup();
      
      // 设置全局批量生成状态
      useAIProgressStore.setState({ 
        isBatchGenerating: true,
        batchGeneratingSource: 'scene_refinement',
      });

      render(<BatchOperations {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '全选' }));

      const generateButton = screen.getByRole('button', { name: /生成中|批量生成/ });
      expect(generateButton).toBeDisabled();
    });

    it('应该在处理中显示加载状态', () => {
      useAIProgressStore.setState({
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: false,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-1',
          statusMessage: '正在处理分镜 1/2...',
        },
        isBatchGenerating: true,
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('正在处理 1 / 2')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('正在处理分镜 1/2...')).toBeInTheDocument();
    });
  });

  describe('批量导出', () => {
    it('应该在选择分镜后能够打开导出对话框', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '全选' }));
      await user.click(screen.getByRole('button', { name: /批量导出/ }));

      expect(screen.getByText('选择导出格式，将导出 5 个分镜')).toBeInTheDocument();
    });

    it('应该禁用导出按钮当未选择分镜时', () => {
      render(<BatchOperations {...defaultProps} />);

      const exportButton = screen.getByRole('button', { name: /批量导出/ });
      expect(exportButton).toBeDisabled();
    });
  });

  describe('批量删除', () => {
    it('应该在选择分镜后能够执行批量删除', async () => {
      const user = userEvent.setup();
      
      // Mock confirm
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => true);

      render(<BatchOperations {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '全选' }));
      await user.click(screen.getByRole('button', { name: /批量删除/ }));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnBatchDelete).toHaveBeenCalledWith(
        expect.arrayContaining(['scene-1', 'scene-2', 'scene-3', 'scene-4', 'scene-5'])
      );

      window.confirm = originalConfirm;
    });

    it('应该在用户取消确认时不执行删除', async () => {
      const user = userEvent.setup();
      
      // Mock confirm to return false
      const originalConfirm = window.confirm;
      window.confirm = vi.fn(() => false);

      render(<BatchOperations {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '全选' }));
      await user.click(screen.getByRole('button', { name: /批量删除/ }));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnBatchDelete).not.toHaveBeenCalled();

      window.confirm = originalConfirm;
    });

    it('应该禁用删除按钮当未选择分镜时', () => {
      render(<BatchOperations {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /批量删除/ });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('暂停和继续', () => {
    it('应该在处理中显示暂停按钮', () => {
      useAIProgressStore.setState({
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: false,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-1',
          statusMessage: '',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByRole('button', { name: /暂停/ })).toBeInTheDocument();
    });

    it('应该在暂停状态显示继续按钮', () => {
      useAIProgressStore.setState({
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: true,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-1',
          statusMessage: '',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByRole('button', { name: /继续/ })).toBeInTheDocument();
    });

    it('应该在暂停时显示提示信息', () => {
      useAIProgressStore.setState({
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: true,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-1',
          statusMessage: '',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('已暂停，点击继续按钮恢复')).toBeInTheDocument();
    });

    it('应该能够切换暂停状态', async () => {
      const user = userEvent.setup();
      
      useAIProgressStore.setState({
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: false,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-1',
          statusMessage: '',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      const pauseButton = screen.getByRole('button', { name: /暂停/ });
      await user.click(pauseButton);

      // 检查状态是否更新
      expect(useAIProgressStore.getState().batchOperations.isPaused).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该正确处理空分镜列表', () => {
      render(<BatchOperations {...defaultProps} scenes={[]} />);

      expect(screen.getByText('批量操作')).toBeInTheDocument();
      expect(screen.getByText('已选择 0 个分镜')).toBeInTheDocument();
    });

    it('应该正确处理只有一个分镜的情况', () => {
      render(<BatchOperations {...defaultProps} scenes={createMockScenes(1)} />);

      expect(screen.getByText('场景 1 概要')).toBeInTheDocument();
    });

    it('应该正确处理大量分镜', () => {
      render(<BatchOperations {...defaultProps} scenes={createMockScenes(100)} />);

      // 应该能正常渲染
      expect(screen.getByText('批量操作')).toBeInTheDocument();
    });

    it('应该在场景属性变化时正确更新', () => {
      const { rerender } = render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('已选择 0 个分镜')).toBeInTheDocument();

      // 模拟选择后重新渲染
      useAIProgressStore.setState({
        batchOperations: {
          ...useAIProgressStore.getState().batchOperations,
          selectedScenes: new Set(['scene-1', 'scene-2']),
        },
      });

      rerender(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('已选择 2 个分镜')).toBeInTheDocument();
    });
  });

  describe('已完成分镜标识', () => {
    it('应该显示已完成分镜的标识', () => {
      const scenes = createMockScenes(3);
      scenes[0].status = 'completed';
      
      render(<BatchOperations {...defaultProps} scenes={scenes} />);

      // 检查已完成的分镜是否有特殊标识
      const completedStatus = screen.getAllByText('状态: 已完成');
      expect(completedStatus.length).toBeGreaterThan(0);
    });
  });

  describe('进度条显示', () => {
    it('应该在批量生成时显示进度条', () => {
      useAIProgressStore.setState({
        isBatchGenerating: true,
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2', 'scene-3']),
          isProcessing: true,
          isPaused: false,
          progress: 33,
          currentScene: 1,
          totalScenes: 3,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['scene-1'],
          failedScenes: [],
          currentSceneId: 'scene-2',
          statusMessage: '正在处理...',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('正在处理 1 / 3')).toBeInTheDocument();
      expect(screen.getByText('33%')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('应该正确显示100%进度', () => {
      useAIProgressStore.setState({
        isBatchGenerating: true,
        batchOperations: {
          selectedScenes: new Set(['scene-1', 'scene-2']),
          isProcessing: true,
          isPaused: false,
          progress: 100,
          currentScene: 2,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['scene-1', 'scene-2'],
          failedScenes: [],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });

      render(<BatchOperations {...defaultProps} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('复选框交互', () => {
    it('应该能够通过复选框选择分镜', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);

      expect(screen.getByText('已选择 1 个分镜')).toBeInTheDocument();
    });

    it('复选框状态应该与选择状态同步', async () => {
      const user = userEvent.setup();
      render(<BatchOperations {...defaultProps} />);

      // 全选
      await user.click(screen.getByRole('button', { name: '全选' }));

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });
  });
});
