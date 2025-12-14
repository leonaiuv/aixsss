import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AIProgressToast, AIProgressIndicator } from './AIProgressToast';
import { useAIProgressStore } from '@/stores/aiProgressStore';

describe('AIProgressToast', () => {
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

  describe('rendering', () => {
    it('should not render when no notifications', () => {
      render(<AIProgressToast />);

      // Component should render nothing visible
      expect(screen.queryByText('生成场景锚点')).not.toBeInTheDocument();
    });
  });

  describe('task display', () => {
    it('should display task title when task exists in store', () => {
      // First add a task
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

      // Emit the event to trigger notification
      const state = useAIProgressStore.getState();
      const task = state.tasks[0];

      render(<AIProgressToast />);

      // Manually trigger the event
      act(() => {
        state.emit('task:started', task);
      });

      expect(screen.getByText('生成场景锚点')).toBeInTheDocument();
    });

    it('should show progress percentage', () => {
      const { addTask } = useAIProgressStore.getState();
      addTask({
        type: 'keyframe_prompt',
        title: '生成关键帧',
        status: 'running',
        priority: 'normal',
        progress: 75,
        currentStep: '处理中...',
        maxRetries: 3,
      });

      const state = useAIProgressStore.getState();
      const task = state.tasks[0];

      render(<AIProgressToast />);

      act(() => {
        state.emit('task:started', task);
      });

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should show scene order when available', () => {
      const { addTask } = useAIProgressStore.getState();
      addTask({
        type: 'motion_prompt',
        title: '生成时空/运动提示词',
        status: 'running',
        priority: 'normal',
        progress: 30,
        sceneOrder: 5,
        maxRetries: 3,
      });

      const state = useAIProgressStore.getState();
      const task = state.tasks[0];

      render(<AIProgressToast />);

      act(() => {
        state.emit('task:started', task);
      });

      expect(screen.getByText('分镜 #5')).toBeInTheDocument();
    });
  });

  describe('task states', () => {
    it('should show success message after task completion', () => {
      const { addTask, completeTask } = useAIProgressStore.getState();
      const taskId = addTask({
        type: 'scene_description',
        title: '生成场景锚点',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      render(<AIProgressToast />);

      const state = useAIProgressStore.getState();
      const task = state.getTask(taskId)!;

      act(() => {
        state.emit('task:started', task);
      });

      // Complete the task
      act(() => {
        completeTask(taskId, {
          content: 'Result',
          tokenUsage: { prompt: 100, completion: 50, total: 150 },
        });
        const updatedTask = useAIProgressStore.getState().getTask(taskId)!;
        useAIProgressStore.getState().emit('task:completed', updatedTask);
      });

      expect(screen.getByText('已完成')).toBeInTheDocument();
    });

    it('should show error message when task fails', () => {
      const { addTask, failTask } = useAIProgressStore.getState();
      const taskId = addTask({
        type: 'motion_prompt',
        title: '生成时空/运动提示词',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      render(<AIProgressToast />);

      const state = useAIProgressStore.getState();
      const task = state.getTask(taskId)!;

      act(() => {
        state.emit('task:started', task);
      });

      // Fail the task
      act(() => {
        failTask(taskId, { message: '网络错误', retryable: true });
        const updatedTask = useAIProgressStore.getState().getTask(taskId)!;
        useAIProgressStore.getState().emit('task:failed', updatedTask);
      });

      expect(screen.getByText('网络错误')).toBeInTheDocument();
    });

    it('should show cancelled message when task is cancelled', () => {
      const { addTask, cancelTask } = useAIProgressStore.getState();
      const taskId = addTask({
        type: 'scene_description',
        title: '生成场景锚点',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      render(<AIProgressToast />);

      const state = useAIProgressStore.getState();
      const task = state.getTask(taskId)!;

      act(() => {
        state.emit('task:started', task);
      });

      act(() => {
        cancelTask(taskId);
        const updatedTask = useAIProgressStore.getState().getTask(taskId)!;
        useAIProgressStore.getState().emit('task:cancelled', updatedTask);
      });

      expect(screen.getByText('已取消')).toBeInTheDocument();
    });
  });
});

describe('AIProgressIndicator', () => {
  beforeEach(() => {
    useAIProgressStore.setState({
      tasks: [],
      activeTaskId: null,
    });
  });

  it('should not render when no active tasks', () => {
    render(<AIProgressIndicator />);

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('should render when there are active tasks', () => {
    const { addTask } = useAIProgressStore.getState();
    addTask({
      type: 'scene_description',
      title: '生成场景锚点',
      status: 'running',
      priority: 'normal',
      progress: 45,
      maxRetries: 3,
    });

    render(<AIProgressIndicator />);

    expect(screen.getByText('生成场景锚点')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('should show count of additional tasks', () => {
    const { addTask } = useAIProgressStore.getState();
    addTask({
      type: 'scene_description',
      title: 'Task 1',
      status: 'running',
      priority: 'normal',
      progress: 50,
      maxRetries: 3,
    });
    addTask({
      type: 'keyframe_prompt',
      title: 'Task 2',
      status: 'running',
      priority: 'normal',
      progress: 30,
      maxRetries: 3,
    });
    addTask({
      type: 'motion_prompt',
      title: 'Task 3',
      status: 'running',
      priority: 'normal',
      progress: 10,
      maxRetries: 3,
    });

    render(<AIProgressIndicator />);

    expect(screen.getByText('(+2 更多)')).toBeInTheDocument();
  });

  it('should display the first active task', () => {
    const { addTask } = useAIProgressStore.getState();
    // Tasks are added in reverse order (newest first)
    addTask({
      type: 'scene_description',
      title: 'First Task',
      status: 'running',
      priority: 'normal',
      progress: 20,
      maxRetries: 3,
    });
    addTask({
      type: 'keyframe_prompt',
      title: 'Second Task',
      status: 'running',
      priority: 'normal',
      progress: 60,
      maxRetries: 3,
    });

    render(<AIProgressIndicator />);

    // Should show the most recent (first in array)
    expect(screen.getByText('Second Task')).toBeInTheDocument();
  });
});
