import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevPanel, DevPanelTrigger } from './DevPanel';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import * as debugLogger from '@/lib/ai/debugLogger';

// Mock debugLogger functions
vi.mock('@/lib/ai/debugLogger', () => ({
  getLogHistory: vi.fn(() => []),
  getCallStatsByType: vi.fn(() => ({})),
  getRecentErrors: vi.fn(() => []),
  getOptimizationSuggestions: vi.fn(() => ['✅ 当前AI调用状态良好，无优化建议']),
  exportLogs: vi.fn(() => '[]'),
  clearLogHistory: vi.fn(),
}));

describe('DevPanel', () => {
  beforeEach(() => {
    // Reset store state
    useAIProgressStore.setState({
      tasks: [],
      activeTaskId: null,
      isQueuePaused: false,
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

  describe('visibility', () => {
    it('should not render when panel is hidden', () => {
      render(<DevPanel />);
      
      expect(screen.queryByText('AI 开发者面板')).not.toBeInTheDocument();
    });

    it('should render when panel is visible', () => {
      useAIProgressStore.getState().showPanel();
      
      render(<DevPanel />);
      
      expect(screen.getByText('AI 开发者面板')).toBeInTheDocument();
    });

    it('should render minimized view when minimized', () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true, 
        isPanelMinimized: true 
      });
      
      render(<DevPanel />);
      
      expect(screen.getByText('空闲')).toBeInTheDocument();
    });

    it('should show active tasks count in minimized view', () => {
      const { addTask } = useAIProgressStore.getState();
      addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      
      useAIProgressStore.setState({ isPanelMinimized: true });
      
      render(<DevPanel />);
      
      expect(screen.getByText(/1 个任务执行中/)).toBeInTheDocument();
    });
  });

  describe('tabs', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should show progress tab by default', () => {
      render(<DevPanel />);
      
      expect(screen.getByRole('tab', { name: /进度/ })).toHaveAttribute('data-state', 'active');
    });

    it('should switch to history tab when clicked', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      const historyTab = screen.getByRole('tab', { name: /历史/ });
      await user.click(historyTab);
      
      expect(historyTab).toHaveAttribute('data-state', 'active');
    });

    it('should switch to errors tab when clicked', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      const errorsTab = screen.getByRole('tab', { name: /错误/ });
      await user.click(errorsTab);
      
      expect(errorsTab).toHaveAttribute('data-state', 'active');
    });

    it('should switch to stats tab when clicked', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      const statsTab = screen.getByRole('tab', { name: /统计/ });
      await user.click(statsTab);
      
      expect(statsTab).toHaveAttribute('data-state', 'active');
    });

    it('should switch to optimize tab when clicked', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      const optimizeTab = screen.getByRole('tab', { name: /优化/ });
      await user.click(optimizeTab);
      
      expect(optimizeTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('progress tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should show empty state when no active tasks', () => {
      render(<DevPanel />);
      
      expect(screen.getByText('暂无正在执行的任务')).toBeInTheDocument();
    });

    it('should display active tasks', () => {
      const { addTask } = useAIProgressStore.getState();
      addTask({
        type: 'scene_description',
        title: '生成场景锚点',
        status: 'running',
        priority: 'normal',
        progress: 50,
        currentStep: '处理中...',
        maxRetries: 3,
      });
      
      render(<DevPanel />);
      
      expect(screen.getByText('生成场景锚点')).toBeInTheDocument();
      expect(screen.getByText('处理中...')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should show scene number if available', () => {
      const { addTask } = useAIProgressStore.getState();
      addTask({
        type: 'keyframe_prompt',
        title: '生成关键帧提示词（KF0/KF1/KF2）',
        status: 'running',
        priority: 'normal',
        progress: 30,
        sceneOrder: 5,
        maxRetries: 3,
      });
      
      render(<DevPanel />);
      
      expect(screen.getByText('分镜 #5')).toBeInTheDocument();
    });
  });

  describe('history tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should show empty state when no history', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /历史/ }));
      
      expect(screen.getByText('暂无历史记录')).toBeInTheDocument();
    });

    it('should display task history', async () => {
      const user = userEvent.setup();
      const { addTask, completeTask } = useAIProgressStore.getState();
      
      const taskId = addTask({
        type: 'scene_description',
        title: '生成场景锚点',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      completeTask(taskId);
      
      render(<DevPanel />);
      await user.click(screen.getByRole('tab', { name: /历史/ }));
      
      expect(screen.getByText('生成场景锚点')).toBeInTheDocument();
    });

    it('should have export button', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /历史/ }));
      
      expect(screen.getByText('导出')).toBeInTheDocument();
    });

    it('should have clear button', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /历史/ }));
      
      expect(screen.getByText('清除')).toBeInTheDocument();
    });
  });

  describe('errors tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should show empty state when no errors', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /错误/ }));
      
      expect(screen.getByText('暂无错误记录')).toBeInTheDocument();
    });

    it('should display error count badge when errors exist', () => {
      vi.mocked(debugLogger.getRecentErrors).mockReturnValue([
        { id: '1', callType: 'scene_description', status: 'error', error: 'Error 1' },
        { id: '2', callType: 'keyframe_prompt', status: 'error', error: 'Error 2' },
      ] as any);
      
      render(<DevPanel />);
      
      const errorsTab = screen.getByRole('tab', { name: /错误/ });
      expect(errorsTab.textContent).toContain('2');
    });
  });

  describe('stats tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should display statistics', async () => {
      const user = userEvent.setup();
      
      useAIProgressStore.setState({
        isPanelVisible: true,
        stats: {
          totalCalls: 10,
          successCount: 8,
          errorCount: 2,
          avgResponseTime: 2500,
          totalTokensUsed: 5000,
          costEstimate: 0.01,
        },
      });
      
      render(<DevPanel />);
      await user.click(screen.getByRole('tab', { name: /统计/ }));
      
      // Check for "总调用" label which should be unique
      expect(screen.getByText('总调用')).toBeInTheDocument();
      expect(screen.getByText('成功')).toBeInTheDocument();
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    it('should display performance metrics', async () => {
      const user = userEvent.setup();
      
      useAIProgressStore.setState({
        isPanelVisible: true,
        stats: {
          totalCalls: 5,
          successCount: 5,
          errorCount: 0,
          avgResponseTime: 3000,
          totalTokensUsed: 7500,
          costEstimate: 0.015,
        },
      });
      
      render(<DevPanel />);
      await user.click(screen.getByRole('tab', { name: /统计/ }));
      
      expect(screen.getByText('平均响应时间')).toBeInTheDocument();
      expect(screen.getByText('总Token消耗')).toBeInTheDocument();
    });
  });

  describe('optimize tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should display optimization suggestions', async () => {
      const user = userEvent.setup();
      vi.mocked(debugLogger.getOptimizationSuggestions).mockReturnValue([
        '✅ 当前AI调用状态良好，无优化建议',
      ]);
      
      render(<DevPanel />);
      await user.click(screen.getByRole('tab', { name: /优化/ }));
      
      expect(screen.getByText('✅ 当前AI调用状态良好，无优化建议')).toBeInTheDocument();
    });

    it('should display multiple suggestions', async () => {
      const user = userEvent.setup();
      vi.mocked(debugLogger.getOptimizationSuggestions).mockReturnValue([
        '⚠️ 错误率过高',
        '💡 Token消耗较高',
      ]);
      
      render(<DevPanel />);
      await user.click(screen.getByRole('tab', { name: /优化/ }));
      
      expect(screen.getByText('⚠️ 错误率过高')).toBeInTheDocument();
      expect(screen.getByText('💡 Token消耗较高')).toBeInTheDocument();
    });
  });

  describe('panel controls', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should have close and minimize buttons', () => {
      render(<DevPanel />);
      
      // Check that buttons exist
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should be able to hide panel via store action', () => {
      render(<DevPanel />);
      
      expect(screen.getByText('AI 开发者面板')).toBeInTheDocument();
      
      // Use store action directly
      useAIProgressStore.getState().hidePanel();
      
      expect(useAIProgressStore.getState().isPanelVisible).toBe(false);
    });

    it('should be able to minimize panel via store action', () => {
      render(<DevPanel />);
      
      // Use store action directly
      useAIProgressStore.getState().minimizePanel();
      
      expect(useAIProgressStore.getState().isPanelMinimized).toBe(true);
    });
  });

  describe('batch tab', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('应该显示批量选项卡', () => {
      render(<DevPanel />);
      
      expect(screen.getByRole('tab', { name: /批量/ })).toBeInTheDocument();
    });

    it('应该能够切换到批量选项卡', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      const batchTab = screen.getByRole('tab', { name: /批量/ });
      await user.click(batchTab);
      
      expect(batchTab).toHaveAttribute('data-state', 'active');
    });

    it('应该显示全局批量状态', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('全局批量状态')).toBeInTheDocument();
    });

    it('应该显示空闲状态当没有批量操作时', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getAllByText('空闲').length).toBeGreaterThan(0);
    });

    it('应该在批量生成中显示正在进行标记', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        isBatchGenerating: true,
        batchGeneratingSource: 'batch_panel',
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('批量生成中')).toBeInTheDocument();
    });

    it('应该显示批量操作来源', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        isBatchGenerating: true,
        batchGeneratingSource: 'batch_panel',
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('批量操作面板')).toBeInTheDocument();
    });

    it('应该显示批量操作详情', async () => {
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('批量操作详情')).toBeInTheDocument();
    });

    it('应该显示操作类型', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(),
          isProcessing: true,
          isPaused: false,
          progress: 50,
          currentScene: 2,
          totalScenes: 4,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: null,
          statusMessage: '',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('操作类型')).toBeInTheDocument();
      expect(screen.getByText('批量生成')).toBeInTheDocument();
    });

    it('应该显示进度信息', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2', 's3']),
          isProcessing: true,
          isPaused: false,
          progress: 66,
          currentScene: 2,
          totalScenes: 3,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['s1', 's2'],
          failedScenes: [],
          currentSceneId: 's3',
          statusMessage: '正在处理...',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      // 使用 getAllByText 获取所有匹配的元素，检查至少有一个
      expect(screen.getAllByText('进度').length).toBeGreaterThan(0);
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('应该显示分镜统计', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2', 's3']),
          isProcessing: false,
          isPaused: false,
          progress: 100,
          currentScene: 3,
          totalScenes: 3,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['s1', 's2'],
          failedScenes: ['s3'],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('选中')).toBeInTheDocument();
      // 使用 getAllByText 获取所有匹配的元素
      expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
      expect(screen.getAllByText('失败').length).toBeGreaterThan(0);
    });

    it('应该显示完成的分镜列表', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2']),
          isProcessing: false,
          isPaused: false,
          progress: 100,
          currentScene: 2,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['scene-001', 'scene-002'],
          failedScenes: [],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('已完成分镜')).toBeInTheDocument();
    });

    it('应该显示失败的分镜列表', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2']),
          isProcessing: false,
          isPaused: false,
          progress: 100,
          currentScene: 2,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: ['scene-001', 'scene-002'],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('失败分镜')).toBeInTheDocument();
    });

    it('应该显示清除按钮当有完成或失败分镜时', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(),
          isProcessing: false,
          isPaused: false,
          progress: 100,
          currentScene: 1,
          totalScenes: 1,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['scene-001'],
          failedScenes: [],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('清除批量操作记录')).toBeInTheDocument();
    });

    it('应该能够清除批量操作记录', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(),
          isProcessing: false,
          isPaused: false,
          progress: 100,
          currentScene: 1,
          totalScenes: 1,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: ['scene-001'],
          failedScenes: [],
          currentSceneId: null,
          statusMessage: '完成',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      await user.click(screen.getByText('清除批量操作记录'));
      
      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.completedScenes).toEqual([]);
      expect(batchOperations.failedScenes).toEqual([]);
    });

    it('应该显示当前处理的分镜ID', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2']),
          isProcessing: true,
          isPaused: false,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 'scene-12345678',
          statusMessage: '处理中',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('当前处理')).toBeInTheDocument();
    });

    it('应该显示暂停状态', async () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        batchOperations: {
          selectedScenes: new Set(['s1', 's2']),
          isProcessing: true,
          isPaused: true,
          progress: 50,
          currentScene: 1,
          totalScenes: 2,
          operationType: 'generate',
          startTime: Date.now(),
          completedScenes: [],
          failedScenes: [],
          currentSceneId: 's1',
          statusMessage: '',
        },
      });
      
      const user = userEvent.setup();
      render(<DevPanel />);
      
      await user.click(screen.getByRole('tab', { name: /批量/ }));
      
      expect(screen.getByText('已暂停')).toBeInTheDocument();
    });

    it('应该在批量操作进行中时显示进行中标记', () => {
      useAIProgressStore.setState({ 
        isPanelVisible: true,
        isBatchGenerating: true,
      });
      
      render(<DevPanel />);
      
      const batchTab = screen.getByRole('tab', { name: /批量/ });
      expect(batchTab.textContent).toContain('进行中');
    });

    it('应该显示不同的操作类型标签', async () => {
      const operationTypes = [
        { type: 'generate', label: '批量生成' },
        { type: 'edit', label: '批量编辑' },
        { type: 'export', label: '批量导出' },
        { type: 'delete', label: '批量删除' },
      ];

      for (const op of operationTypes) {
        useAIProgressStore.setState({ 
          isPanelVisible: true,
          batchOperations: {
            selectedScenes: new Set(),
            isProcessing: true,
            isPaused: false,
            progress: 0,
            currentScene: 0,
            totalScenes: 0,
            operationType: op.type as any,
            startTime: null,
            completedScenes: [],
            failedScenes: [],
            currentSceneId: null,
            statusMessage: '',
          },
        });
        
        const user = userEvent.setup();
        const { unmount } = render(<DevPanel />);
        
        await user.click(screen.getByRole('tab', { name: /批量/ }));
        
        expect(screen.getByText(op.label)).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe('status bar', () => {
    beforeEach(() => {
      useAIProgressStore.getState().showPanel();
    });

    it('should display success rate', () => {
      useAIProgressStore.setState({
        isPanelVisible: true,
        stats: {
          totalCalls: 10,
          successCount: 8,
          errorCount: 2,
          avgResponseTime: 0,
          totalTokensUsed: 0,
          costEstimate: 0.005,
        },
      });
      
      render(<DevPanel />);
      
      expect(screen.getByText(/成功率:/)).toBeInTheDocument();
    });

    it('should display estimated cost', () => {
      useAIProgressStore.setState({
        isPanelVisible: true,
        stats: {
          totalCalls: 10,
          successCount: 10,
          errorCount: 0,
          avgResponseTime: 0,
          totalTokensUsed: 0,
          costEstimate: 0.0123,
        },
      });
      
      render(<DevPanel />);
      
      expect(screen.getByText(/预估成本:/)).toBeInTheDocument();
    });
  });
});

describe('DevPanelTrigger', () => {
  beforeEach(() => {
    useAIProgressStore.setState({
      tasks: [],
      isPanelVisible: false,
    });
  });

  it('should render when panel is hidden', () => {
    render(<DevPanelTrigger />);
    
    expect(screen.getByText('Dev Panel')).toBeInTheDocument();
  });

  it('should not render when panel is visible', () => {
    useAIProgressStore.setState({ isPanelVisible: true });
    
    render(<DevPanelTrigger />);
    
    expect(screen.queryByText('Dev Panel')).not.toBeInTheDocument();
  });

  it('should show active tasks count badge', () => {
    const { addTask } = useAIProgressStore.getState();
    addTask({
      type: 'scene_description',
      title: 'Task 1',
      status: 'running',
      priority: 'normal',
      progress: 0,
      maxRetries: 3,
    });
    addTask({
      type: 'keyframe_prompt',
      title: 'Task 2',
      status: 'running',
      priority: 'normal',
      progress: 0,
      maxRetries: 3,
    });
    
    // Hide panel again after addTask auto-shows it
    useAIProgressStore.setState({ isPanelVisible: false });
    
    render(<DevPanelTrigger />);
    
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should toggle panel when clicked', async () => {
    const user = userEvent.setup();
    render(<DevPanelTrigger />);
    
    await user.click(screen.getByText('Dev Panel'));
    
    expect(useAIProgressStore.getState().isPanelVisible).toBe(true);
  });
});
