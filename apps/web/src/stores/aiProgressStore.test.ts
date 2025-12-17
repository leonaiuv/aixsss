import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useAIProgressStore,
  getTaskTypeLabel,
  getTaskStatusLabel,
  getTaskStatusColor,
} from './aiProgressStore';

describe('aiProgressStore', () => {
  beforeEach(() => {
    // Reset store state before each test
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

  describe('initial state', () => {
    it('should have empty tasks array', () => {
      const state = useAIProgressStore.getState();
      expect(state.tasks).toEqual([]);
    });

    it('should have null activeTaskId', () => {
      const state = useAIProgressStore.getState();
      expect(state.activeTaskId).toBeNull();
    });

    it('should have panel hidden by default', () => {
      const state = useAIProgressStore.getState();
      expect(state.isPanelVisible).toBe(false);
      expect(state.isPanelMinimized).toBe(false);
    });

    it('should have default stats', () => {
      const state = useAIProgressStore.getState();
      expect(state.stats.totalCalls).toBe(0);
      expect(state.stats.successCount).toBe(0);
      expect(state.stats.errorCount).toBe(0);
    });
  });

  describe('addTask', () => {
    it('should add a new task and return its id', () => {
      const { addTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(taskId).toBeDefined();
      expect(taskId).toMatch(/^task_/);
      expect(useAIProgressStore.getState().tasks).toHaveLength(1);
    });

    it('should set createdAt timestamp', () => {
      const { addTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      const task = getTask(taskId);
      expect(task?.createdAt).toBeDefined();
      expect(typeof task?.createdAt).toBe('number');
    });

    it('should initialize retryCount to 0', () => {
      const { addTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      const task = getTask(taskId);
      expect(task?.retryCount).toBe(0);
    });

    it('should show panel when adding task', () => {
      const { addTask } = useAIProgressStore.getState();

      expect(useAIProgressStore.getState().isPanelVisible).toBe(false);

      addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(useAIProgressStore.getState().isPanelVisible).toBe(true);
    });

    it('should add new tasks at the beginning of the array', () => {
      const { addTask } = useAIProgressStore.getState();

      const taskId1 = addTask({
        type: 'scene_description',
        title: 'Task 1',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      const taskId2 = addTask({
        type: 'keyframe_prompt',
        title: 'Task 2',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks[0].id).toBe(taskId2);
      expect(tasks[1].id).toBe(taskId1);
    });
  });

  describe('updateTask', () => {
    it('should update task properties', () => {
      const { addTask, updateTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      updateTask(taskId, { progress: 50, currentStep: 'Processing...' });

      const task = getTask(taskId);
      expect(task?.progress).toBe(50);
      expect(task?.currentStep).toBe('Processing...');
    });

    it('should not affect other tasks', () => {
      const { addTask, updateTask, getTask } = useAIProgressStore.getState();

      const taskId1 = addTask({
        type: 'scene_description',
        title: 'Task 1',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      const taskId2 = addTask({
        type: 'keyframe_prompt',
        title: 'Task 2',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      updateTask(taskId1, { progress: 100 });

      expect(getTask(taskId1)?.progress).toBe(100);
      expect(getTask(taskId2)?.progress).toBe(0);
    });
  });

  describe('removeTask', () => {
    it('should remove task from list', () => {
      const { addTask, removeTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(useAIProgressStore.getState().tasks).toHaveLength(1);

      removeTask(taskId);

      expect(useAIProgressStore.getState().tasks).toHaveLength(0);
    });

    it('should clear activeTaskId if removed task was active', () => {
      const { addTask, removeTask, startTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);
      expect(useAIProgressStore.getState().activeTaskId).toBe(taskId);

      removeTask(taskId);
      expect(useAIProgressStore.getState().activeTaskId).toBeNull();
    });
  });

  describe('startTask', () => {
    it('should set task status to running', () => {
      const { addTask, startTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);

      const task = getTask(taskId);
      expect(task?.status).toBe('running');
    });

    it('should set startedAt timestamp', () => {
      const { addTask, startTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);

      const task = getTask(taskId);
      expect(task?.startedAt).toBeDefined();
    });

    it('should set activeTaskId', () => {
      const { addTask, startTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);

      expect(useAIProgressStore.getState().activeTaskId).toBe(taskId);
    });
  });

  describe('completeTask', () => {
    it('should set task status to success', () => {
      const { addTask, startTask, completeTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);
      completeTask(taskId, { content: 'Result' });

      const task = getTask(taskId);
      expect(task?.status).toBe('success');
      expect(task?.progress).toBe(100);
    });

    it('should set completedAt timestamp', () => {
      const { addTask, completeTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      completeTask(taskId);

      const task = getTask(taskId);
      expect(task?.completedAt).toBeDefined();
    });

    it('should store response data', () => {
      const { addTask, completeTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      const response = {
        content: 'AI Response',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      };

      completeTask(taskId, response);

      const task = getTask(taskId);
      expect(task?.response).toEqual(response);
    });

    it('should clear activeTaskId if completed task was active', () => {
      const { addTask, startTask, completeTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      startTask(taskId);
      expect(useAIProgressStore.getState().activeTaskId).toBe(taskId);

      completeTask(taskId);
      expect(useAIProgressStore.getState().activeTaskId).toBeNull();
    });
  });

  describe('failTask', () => {
    it('should set task status to error', () => {
      const { addTask, failTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      failTask(taskId, { message: 'Network error', retryable: true });

      const task = getTask(taskId);
      expect(task?.status).toBe('error');
    });

    it('should store error information', () => {
      const { addTask, failTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      const error = { message: 'API Error', code: '500', retryable: true };
      failTask(taskId, error);

      const task = getTask(taskId);
      expect(task?.error).toEqual(error);
    });
  });

  describe('cancelTask', () => {
    it('should set task status to cancelled', () => {
      const { addTask, cancelTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      cancelTask(taskId);

      const task = getTask(taskId);
      expect(task?.status).toBe('cancelled');
    });
  });

  describe('retryTask', () => {
    it('should increment retryCount', () => {
      const { addTask, failTask, retryTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      failTask(taskId, { message: 'Error', retryable: true });
      retryTask(taskId);

      const task = getTask(taskId);
      expect(task?.retryCount).toBe(1);
      expect(task?.status).toBe('queued');
    });

    it('should not retry if max retries exceeded', () => {
      const { addTask, failTask, retryTask, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 1,
      });

      failTask(taskId, { message: 'Error', retryable: true });

      // First retry
      retryTask(taskId);
      expect(getTask(taskId)?.retryCount).toBe(1);

      // Update status back to error
      useAIProgressStore.getState().updateTask(taskId, { status: 'error' });

      // Second retry should not work
      retryTask(taskId);
      expect(getTask(taskId)?.retryCount).toBe(1); // Should not increment
    });
  });

  describe('updateProgress', () => {
    it('should update task progress', () => {
      const { addTask, updateProgress, getTask } = useAIProgressStore.getState();

      const taskId = addTask({
        type: 'scene_description',
        title: 'Test Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      updateProgress(taskId, 75, 'Almost done...');

      const task = getTask(taskId);
      expect(task?.progress).toBe(75);
      expect(task?.currentStep).toBe('Almost done...');
    });
  });

  describe('panel controls', () => {
    it('togglePanel should toggle visibility', () => {
      const { togglePanel } = useAIProgressStore.getState();

      expect(useAIProgressStore.getState().isPanelVisible).toBe(false);

      togglePanel();
      expect(useAIProgressStore.getState().isPanelVisible).toBe(true);

      togglePanel();
      expect(useAIProgressStore.getState().isPanelVisible).toBe(false);
    });

    it('showPanel should set visibility to true', () => {
      const { showPanel } = useAIProgressStore.getState();

      showPanel();
      expect(useAIProgressStore.getState().isPanelVisible).toBe(true);
    });

    it('hidePanel should set visibility to false', () => {
      const { showPanel, hidePanel } = useAIProgressStore.getState();

      showPanel();
      hidePanel();
      expect(useAIProgressStore.getState().isPanelVisible).toBe(false);
    });

    it('minimizePanel should set minimized to true', () => {
      const { minimizePanel } = useAIProgressStore.getState();

      minimizePanel();
      expect(useAIProgressStore.getState().isPanelMinimized).toBe(true);
    });

    it('expandPanel should set minimized to false', () => {
      const { minimizePanel, expandPanel } = useAIProgressStore.getState();

      minimizePanel();
      expandPanel();
      expect(useAIProgressStore.getState().isPanelMinimized).toBe(false);
    });
  });

  describe('clearCompletedTasks', () => {
    it('should remove completed and error tasks', () => {
      const { addTask, completeTask, failTask, clearCompletedTasks } =
        useAIProgressStore.getState();

      const runningId = addTask({
        type: 'scene_description',
        title: 'Running Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      const completedId = addTask({
        type: 'keyframe_prompt',
        title: 'Completed Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      const errorId = addTask({
        type: 'motion_prompt',
        title: 'Error Task',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      completeTask(completedId);
      failTask(errorId, { message: 'Error', retryable: false });

      clearCompletedTasks();

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(runningId);
    });
  });

  describe('clearAllTasks', () => {
    it('should remove all tasks', () => {
      const { addTask, clearAllTasks } = useAIProgressStore.getState();

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
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(useAIProgressStore.getState().tasks).toHaveLength(2);

      clearAllTasks();

      expect(useAIProgressStore.getState().tasks).toHaveLength(0);
      expect(useAIProgressStore.getState().activeTaskId).toBeNull();
    });
  });

  describe('getActiveTasks', () => {
    it('should return only running and queued tasks', () => {
      const { addTask, completeTask, getActiveTasks } = useAIProgressStore.getState();

      addTask({
        type: 'scene_description',
        title: 'Running',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      addTask({
        type: 'keyframe_prompt',
        title: 'Queued',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });
      const completedId = addTask({
        type: 'motion_prompt',
        title: 'Completed',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      completeTask(completedId);

      const activeTasks = getActiveTasks();
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.every((t) => t.status === 'running' || t.status === 'queued')).toBe(true);
    });
  });

  describe('getRecentTasks', () => {
    it('should return limited number of tasks', () => {
      const { addTask, getRecentTasks } = useAIProgressStore.getState();

      for (let i = 0; i < 25; i++) {
        addTask({
          type: 'scene_description',
          title: `Task ${i}`,
          status: 'running',
          priority: 'normal',
          progress: 0,
          maxRetries: 3,
        });
      }

      const recentTasks = getRecentTasks(10);
      expect(recentTasks).toHaveLength(10);
    });

    it('should default to 20 tasks', () => {
      const { addTask, getRecentTasks } = useAIProgressStore.getState();

      for (let i = 0; i < 25; i++) {
        addTask({
          type: 'scene_description',
          title: `Task ${i}`,
          status: 'running',
          priority: 'normal',
          progress: 0,
          maxRetries: 3,
        });
      }

      const recentTasks = getRecentTasks();
      expect(recentTasks).toHaveLength(20);
    });
  });

  describe('filter', () => {
    it('setFilter should update filter state', () => {
      const { setFilter } = useAIProgressStore.getState();

      setFilter({ status: ['running', 'queued'] });

      expect(useAIProgressStore.getState().filter.status).toEqual(['running', 'queued']);
    });

    it('clearFilter should reset filter', () => {
      const { setFilter, clearFilter } = useAIProgressStore.getState();

      setFilter({ status: ['running'], type: ['scene_description'] });
      clearFilter();

      expect(useAIProgressStore.getState().filter).toEqual({});
    });

    it('getFilteredTasks should filter by status', () => {
      const { addTask, completeTask, setFilter, getFilteredTasks } = useAIProgressStore.getState();

      addTask({
        type: 'scene_description',
        title: 'Running',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      const completedId = addTask({
        type: 'keyframe_prompt',
        title: 'Completed',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      completeTask(completedId);

      setFilter({ status: ['success'] });

      const filtered = getFilteredTasks();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('success');
    });

    it('getFilteredTasks should filter by type', () => {
      const { addTask, setFilter, getFilteredTasks } = useAIProgressStore.getState();

      addTask({
        type: 'scene_description',
        title: 'Scene',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      addTask({
        type: 'keyframe_prompt',
        title: 'Keyframe',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });

      setFilter({ type: ['scene_description'] });

      const filtered = getFilteredTasks();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('scene_description');
    });
  });

  describe('stats', () => {
    it('refreshStats should calculate correct statistics', () => {
      const { addTask, startTask, completeTask, failTask, refreshStats } =
        useAIProgressStore.getState();

      // Add and complete a task with token usage
      const id1 = addTask({
        type: 'scene_description',
        title: 'Task 1',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });
      startTask(id1);
      completeTask(id1, {
        content: 'Result',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      });

      // Add and fail a task
      const id2 = addTask({
        type: 'keyframe_prompt',
        title: 'Task 2',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      failTask(id2, { message: 'Error', retryable: false });

      refreshStats();

      const { stats } = useAIProgressStore.getState();
      expect(stats.totalCalls).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.totalTokensUsed).toBe(150);
    });
  });

  describe('event subscription', () => {
    it('subscribe should register callback and return unsubscribe function', () => {
      const { subscribe, addTask } = useAIProgressStore.getState();
      const callback = vi.fn();

      const unsubscribe = subscribe('task:added', callback);

      addTask({
        type: 'scene_description',
        title: 'Task',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      addTask({
        type: 'keyframe_prompt',
        title: 'Task 2',
        status: 'running',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });

      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should emit events for task lifecycle', () => {
      const { subscribe, addTask, startTask, completeTask, failTask } =
        useAIProgressStore.getState();

      const startedCallback = vi.fn();
      const completedCallback = vi.fn();
      const failedCallback = vi.fn();

      subscribe('task:started', startedCallback);
      subscribe('task:completed', completedCallback);
      subscribe('task:failed', failedCallback);

      const id1 = addTask({
        type: 'scene_description',
        title: 'Task 1',
        status: 'queued',
        priority: 'normal',
        progress: 0,
        maxRetries: 3,
      });
      startTask(id1);
      expect(startedCallback).toHaveBeenCalled();

      completeTask(id1);
      expect(completedCallback).toHaveBeenCalled();

      const id2 = addTask({
        type: 'keyframe_prompt',
        title: 'Task 2',
        status: 'running',
        priority: 'normal',
        progress: 50,
        maxRetries: 3,
      });
      failTask(id2, { message: 'Error', retryable: false });
      expect(failedCallback).toHaveBeenCalled();
    });
  });
});

describe('批量操作状态管理', () => {
  beforeEach(() => {
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
  });

  describe('startBatchGenerating', () => {
    it('应该设置全局批量生成状态', () => {
      const { startBatchGenerating } = useAIProgressStore.getState();

      startBatchGenerating('batch_panel');

      expect(useAIProgressStore.getState().isBatchGenerating).toBe(true);
      expect(useAIProgressStore.getState().batchGeneratingSource).toBe('batch_panel');
    });

    it('应该支持不同的来源', () => {
      const { startBatchGenerating } = useAIProgressStore.getState();

      startBatchGenerating('scene_refinement');

      expect(useAIProgressStore.getState().batchGeneratingSource).toBe('scene_refinement');
    });

    it('应该支持episode_workflow来源', () => {
      const { startBatchGenerating } = useAIProgressStore.getState();

      startBatchGenerating('episode_workflow');

      expect(useAIProgressStore.getState().batchGeneratingSource).toBe('episode_workflow');
      expect(useAIProgressStore.getState().isBatchGenerating).toBe(true);
    });
  });

  describe('stopBatchGenerating', () => {
    it('应该清除全局批量生成状态', () => {
      const { startBatchGenerating, stopBatchGenerating } = useAIProgressStore.getState();

      startBatchGenerating('batch_panel');
      stopBatchGenerating();

      expect(useAIProgressStore.getState().isBatchGenerating).toBe(false);
      expect(useAIProgressStore.getState().batchGeneratingSource).toBeNull();
    });
  });

  describe('updateBatchOperations', () => {
    it('应该更新批量操作状态', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({
        isProcessing: true,
        progress: 50,
        currentScene: 3,
        totalScenes: 6,
        operationType: 'generate',
        statusMessage: '正在处理...',
      });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.isProcessing).toBe(true);
      expect(batchOperations.progress).toBe(50);
      expect(batchOperations.currentScene).toBe(3);
      expect(batchOperations.totalScenes).toBe(6);
      expect(batchOperations.operationType).toBe('generate');
      expect(batchOperations.statusMessage).toBe('正在处理...');
    });

    it('应该部分更新状态而不影响其他字段', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ progress: 25 });
      updateBatchOperations({ currentScene: 1 });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.progress).toBe(25);
      expect(batchOperations.currentScene).toBe(1);
    });

    it('应该能够设置开始时间', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();
      const now = Date.now();

      updateBatchOperations({ startTime: now });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.startTime).toBe(now);
    });

    it('应该能够设置当前处理的分镜ID', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ currentSceneId: 'scene-123' });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.currentSceneId).toBe('scene-123');
    });
  });

  describe('resetBatchOperations', () => {
    it('应该重置所有批量操作状态', () => {
      const { updateBatchOperations, resetBatchOperations } = useAIProgressStore.getState();

      // 先设置一些状态
      updateBatchOperations({
        isProcessing: true,
        isPaused: true,
        progress: 75,
        currentScene: 5,
        totalScenes: 10,
        operationType: 'generate',
        startTime: Date.now(),
        completedScenes: ['scene-1', 'scene-2'],
        failedScenes: ['scene-3'],
        currentSceneId: 'scene-4',
        statusMessage: '测试消息',
      });

      resetBatchOperations();

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.isProcessing).toBe(false);
      expect(batchOperations.isPaused).toBe(false);
      expect(batchOperations.cancelRequested).toBe(false);
      expect(batchOperations.progress).toBe(0);
      expect(batchOperations.currentScene).toBe(0);
      expect(batchOperations.totalScenes).toBe(0);
      expect(batchOperations.operationType).toBeNull();
      expect(batchOperations.startTime).toBeNull();
      expect(batchOperations.completedScenes).toEqual([]);
      expect(batchOperations.failedScenes).toEqual([]);
      expect(batchOperations.currentSceneId).toBeNull();
      expect(batchOperations.statusMessage).toBe('');
    });

    it('应该清空选中的分镜', () => {
      const { setBatchSelectedScenes, resetBatchOperations } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3']);
      expect(useAIProgressStore.getState().batchOperations.selectedScenes.size).toBe(3);

      resetBatchOperations();
      expect(useAIProgressStore.getState().batchOperations.selectedScenes.size).toBe(0);
    });
  });

  describe('setBatchSelectedScenes', () => {
    it('应该设置选中的分镜列表', () => {
      const { setBatchSelectedScenes } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3']);

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.selectedScenes.size).toBe(3);
      expect(batchOperations.selectedScenes.has('scene-1')).toBe(true);
      expect(batchOperations.selectedScenes.has('scene-2')).toBe(true);
      expect(batchOperations.selectedScenes.has('scene-3')).toBe(true);
    });

    it('应该同时更新totalScenes', () => {
      const { setBatchSelectedScenes } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2']);

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.totalScenes).toBe(2);
    });

    it('应该处理空数组', () => {
      const { setBatchSelectedScenes } = useAIProgressStore.getState();

      setBatchSelectedScenes([]);

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.selectedScenes.size).toBe(0);
      expect(batchOperations.totalScenes).toBe(0);
    });

    it('应该处理重复的ID', () => {
      const { setBatchSelectedScenes } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-1', 'scene-2']);

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.selectedScenes.size).toBe(2); // Set自动去重
    });
  });

  describe('addBatchCompletedScene', () => {
    it('应该添加完成的分镜', () => {
      const { setBatchSelectedScenes, addBatchCompletedScene } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3']);
      addBatchCompletedScene('scene-1');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.completedScenes).toContain('scene-1');
      expect(batchOperations.completedScenes.length).toBe(1);
    });

    it('应该更新当前分镜索引', () => {
      const { setBatchSelectedScenes, addBatchCompletedScene } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3']);
      addBatchCompletedScene('scene-1');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.currentScene).toBe(1);
    });

    it('应该更新进度', () => {
      const { setBatchSelectedScenes, addBatchCompletedScene } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3']);
      addBatchCompletedScene('scene-1');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.progress).toBe(33); // 1/3 ≈ 33%
    });

    it('应该累加多个完成的分镜', () => {
      const { setBatchSelectedScenes, addBatchCompletedScene } = useAIProgressStore.getState();

      setBatchSelectedScenes(['scene-1', 'scene-2', 'scene-3', 'scene-4']);
      addBatchCompletedScene('scene-1');
      addBatchCompletedScene('scene-2');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.completedScenes.length).toBe(2);
      expect(batchOperations.currentScene).toBe(2);
      expect(batchOperations.progress).toBe(50); // 2/4 = 50%
    });
  });

  describe('addBatchFailedScene', () => {
    it('应该添加失败的分镜', () => {
      const { addBatchFailedScene } = useAIProgressStore.getState();

      addBatchFailedScene('scene-1');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.failedScenes).toContain('scene-1');
      expect(batchOperations.failedScenes.length).toBe(1);
    });

    it('应该累加多个失败的分镜', () => {
      const { addBatchFailedScene } = useAIProgressStore.getState();

      addBatchFailedScene('scene-1');
      addBatchFailedScene('scene-2');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.failedScenes.length).toBe(2);
    });

    it('不应该影响completedScenes', () => {
      const { addBatchCompletedScene, addBatchFailedScene } = useAIProgressStore.getState();

      addBatchCompletedScene('scene-1');
      addBatchFailedScene('scene-2');

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.completedScenes.length).toBe(1);
      expect(batchOperations.failedScenes.length).toBe(1);
    });
  });

  describe('批量操作与暂停', () => {
    it('应该能够暂停批量操作', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ isProcessing: true, isPaused: false });
      updateBatchOperations({ isPaused: true });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.isPaused).toBe(true);
    });

    it('应该能够继续批量操作', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ isProcessing: true, isPaused: true });
      updateBatchOperations({ isPaused: false });

      const { batchOperations } = useAIProgressStore.getState();
      expect(batchOperations.isPaused).toBe(false);
    });
  });

  describe('批量操作类型', () => {
    it('应该支持generate类型', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ operationType: 'generate' });

      expect(useAIProgressStore.getState().batchOperations.operationType).toBe('generate');
    });

    it('应该支持edit类型', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ operationType: 'edit' });

      expect(useAIProgressStore.getState().batchOperations.operationType).toBe('edit');
    });

    it('应该支持export类型', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ operationType: 'export' });

      expect(useAIProgressStore.getState().batchOperations.operationType).toBe('export');
    });

    it('应该支持delete类型', () => {
      const { updateBatchOperations } = useAIProgressStore.getState();

      updateBatchOperations({ operationType: 'delete' });

      expect(useAIProgressStore.getState().batchOperations.operationType).toBe('delete');
    });
  });

  describe('交叉生成防护', () => {
    it('应该通过isBatchGenerating防止交叉生成', () => {
      const { startBatchGenerating, stopBatchGenerating } = useAIProgressStore.getState();

      // 模拟批量操作面板开始生成
      startBatchGenerating('batch_panel');

      expect(useAIProgressStore.getState().isBatchGenerating).toBe(true);
      expect(useAIProgressStore.getState().batchGeneratingSource).toBe('batch_panel');

      // 其他组件应该检查isBatchGenerating来禁用生成按钮
      // 在stopBatchGenerating之前，其他生成应该被阻止

      stopBatchGenerating();
      expect(useAIProgressStore.getState().isBatchGenerating).toBe(false);
    });

    it('应该区分不同的生成来源', () => {
      const { startBatchGenerating } = useAIProgressStore.getState();

      startBatchGenerating('scene_refinement');

      // 可以检查来源来决定是否阻止
      const state = useAIProgressStore.getState();
      expect(state.batchGeneratingSource).toBe('scene_refinement');
      expect(state.isBatchGenerating).toBe(true);
    });
  });
});

describe('helper functions', () => {
  describe('getTaskTypeLabel', () => {
    it('should return correct labels for all types', () => {
      expect(getTaskTypeLabel('scene_list_generation')).toBe('分镜列表生成');
      expect(getTaskTypeLabel('scene_description')).toBe('场景锚点');
      expect(getTaskTypeLabel('keyframe_prompt')).toBe('关键帧提示词（KF0/KF1/KF2）');
      expect(getTaskTypeLabel('motion_prompt')).toBe('时空/运动提示词');
      expect(getTaskTypeLabel('custom')).toBe('自定义调用');
    });
  });

  describe('getTaskStatusLabel', () => {
    it('should return correct labels for all statuses', () => {
      expect(getTaskStatusLabel('queued')).toBe('排队中');
      expect(getTaskStatusLabel('running')).toBe('执行中');
      expect(getTaskStatusLabel('success')).toBe('已完成');
      expect(getTaskStatusLabel('error')).toBe('失败');
      expect(getTaskStatusLabel('cancelled')).toBe('已取消');
    });
  });

  describe('getTaskStatusColor', () => {
    it('should return correct colors for all statuses', () => {
      expect(getTaskStatusColor('queued')).toBe('text-yellow-500');
      expect(getTaskStatusColor('running')).toBe('text-blue-500');
      expect(getTaskStatusColor('success')).toBe('text-green-500');
      expect(getTaskStatusColor('error')).toBe('text-red-500');
      expect(getTaskStatusColor('cancelled')).toBe('text-gray-500');
    });
  });
});
