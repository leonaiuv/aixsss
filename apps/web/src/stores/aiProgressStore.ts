/**
 * AI进度追踪Store
 * 用于管理和追踪所有AI调用的状态、进度、错误和性能指标
 */
import { create } from 'zustand';
import type { AICallType } from '@/lib/ai/debugLogger';

// ==========================================
// 类型定义
// ==========================================

// AI任务状态
export type AITaskStatus =
  | 'queued' // 队列中
  | 'running' // 执行中
  | 'success' // 成功
  | 'error' // 失败
  | 'cancelled'; // 已取消

// 批量操作类型
export type BatchOperationType = 'generate' | 'edit' | 'export' | 'delete' | null;

// 批量操作状态接口
export interface BatchOperationsState {
  selectedScenes: Set<string>;
  isProcessing: boolean;
  isPaused: boolean;
  cancelRequested: boolean;
  progress: number;
  currentScene: number;
  totalScenes: number;
  operationType: BatchOperationType;
  startTime: number | null;
  completedScenes: string[];
  failedScenes: string[];
  currentSceneId: string | null;
  statusMessage: string;
}

// AI任务优先级
export type AITaskPriority = 'low' | 'normal' | 'high';

// AI任务项
export interface AITask {
  id: string;
  type: AICallType;
  title: string;
  description?: string;
  status: AITaskStatus;
  priority: AITaskPriority;

  // 进度信息
  progress: number; // 0-100
  currentStep?: string; // 当前步骤描述

  // 上下文
  projectId?: string;
  sceneId?: string;
  sceneOrder?: number;
  characterId?: string;

  // 时间戳
  createdAt: number;
  startedAt?: number;
  completedAt?: number;

  // 流式输出监控
  currentOutput?: string; // 当前累积的AI输出（用于实时监控）
  rawOutput?: string; // 原始完整输出（用于错误调试）

  // 响应信息
  response?: {
    content: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  };

  // 错误信息
  error?: {
    message: string;
    code?: string;
    details?: string;
    retryable: boolean;
    rawOutput?: string; // 导致错误的原始输出
  };

  // 重试信息
  retryCount: number;
  maxRetries: number;
}

// 性能统计
export interface AIPerformanceStats {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  totalTokensUsed: number;
  costEstimate: number;
}

// 过滤器
export interface AITaskFilter {
  status?: AITaskStatus[];
  type?: AICallType[];
  projectId?: string;
  timeRange?: {
    start: number;
    end: number;
  };
}

// ==========================================
// Store定义
// ==========================================

interface AIProgressState {
  // 任务列表
  tasks: AITask[];

  // 当前活跃任务ID
  activeTaskId: string | null;

  // 队列状态
  isQueuePaused: boolean;

  // 全局批量生成状态（用于防止交叉生成）
  isBatchGenerating: boolean;
  batchGeneratingSource: 'batch_panel' | 'scene_refinement' | 'episode_workflow' | null;

  // 完整的批量操作状态
  batchOperations: BatchOperationsState;

  // 面板可见性
  isPanelVisible: boolean;
  isPanelMinimized: boolean;

  // 过滤器
  filter: AITaskFilter;

  // 统计数据
  stats: AIPerformanceStats;

  // 事件监听器
  listeners: Map<string, ((task: AITask) => void)[]>;
}

interface AIProgressActions {
  // 任务管理
  addTask: (task: Omit<AITask, 'id' | 'createdAt' | 'retryCount'>) => string;
  updateTask: (taskId: string, updates: Partial<AITask>) => void;
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;

  // 任务状态更新
  startTask: (taskId: string) => void;
  completeTask: (taskId: string, response?: AITask['response']) => void;
  failTask: (taskId: string, error: AITask['error']) => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;

  // 进度更新
  updateProgress: (taskId: string, progress: number, currentStep?: string) => void;

  // 流式输出更新
  updateTaskOutput: (taskId: string, output: string) => void;
  appendTaskOutput: (taskId: string, chunk: string) => void;

  // 队列控制
  pauseQueue: () => void;
  resumeQueue: () => void;

  // 批量生成状态控制
  startBatchGenerating: (source: 'batch_panel' | 'scene_refinement' | 'episode_workflow') => void;
  stopBatchGenerating: () => void;

  // 批量操作详细状态控制
  updateBatchOperations: (updates: Partial<BatchOperationsState>) => void;
  resetBatchOperations: () => void;
  setBatchSelectedScenes: (sceneIds: string[]) => void;
  addBatchCompletedScene: (sceneId: string) => void;
  addBatchFailedScene: (sceneId: string) => void;

  // 面板控制
  togglePanel: () => void;
  showPanel: () => void;
  hidePanel: () => void;
  minimizePanel: () => void;
  expandPanel: () => void;

  // 过滤器
  setFilter: (filter: Partial<AITaskFilter>) => void;
  clearFilter: () => void;

  // 获取任务
  getTask: (taskId: string) => AITask | undefined;
  getFilteredTasks: () => AITask[];
  getActiveTasks: () => AITask[];
  getRecentTasks: (limit?: number) => AITask[];

  // 统计
  refreshStats: () => void;

  // 事件订阅
  subscribe: (event: string, callback: (task: AITask) => void) => () => void;
  emit: (event: string, task: AITask) => void;
}

// ==========================================
// Store实现
// ==========================================

const generateTaskId = () => `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const calculateStats = (tasks: AITask[]): AIPerformanceStats => {
  const completedTasks = tasks.filter((t) => t.status === 'success' || t.status === 'error');
  const successTasks = tasks.filter((t) => t.status === 'success');
  const errorTasks = tasks.filter((t) => t.status === 'error');

  let totalResponseTime = 0;
  let totalTokens = 0;

  successTasks.forEach((task) => {
    if (task.startedAt && task.completedAt) {
      totalResponseTime += task.completedAt - task.startedAt;
    }
    if (task.response?.tokenUsage) {
      totalTokens += task.response.tokenUsage.total;
    }
  });

  // 估算成本 (假设 $0.002 per 1K tokens)
  const costEstimate = (totalTokens / 1000) * 0.002;

  return {
    totalCalls: completedTasks.length,
    successCount: successTasks.length,
    errorCount: errorTasks.length,
    avgResponseTime: successTasks.length > 0 ? totalResponseTime / successTasks.length : 0,
    totalTokensUsed: totalTokens,
    costEstimate,
  };
};

export const useAIProgressStore = create<AIProgressState & AIProgressActions>((set, get) => ({
  // 初始状态
  tasks: [],
  activeTaskId: null,
  isQueuePaused: false,
  isBatchGenerating: false,
  batchGeneratingSource: null,
  batchOperations: {
    selectedScenes: new Set(),
    isProcessing: false,
    isPaused: false,
    cancelRequested: false,
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

  // 添加任务
  addTask: (taskData) => {
    const id = generateTaskId();
    const task: AITask = {
      ...taskData,
      id,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: taskData.maxRetries ?? 3,
    };

    set((state) => ({
      tasks: [task, ...state.tasks],
      activeTaskId: task.status === 'running' ? id : state.activeTaskId,
    }));

    get().emit('task:added', task);

    // 自动显示面板
    if (!get().isPanelVisible) {
      get().showPanel();
    }

    return id;
  },

  // 更新任务
  updateTask: (taskId, updates) => {
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
    }));

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:updated', task);
    }
  },

  // 删除任务
  removeTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
      activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
    }));
  },

  // 清除已完成任务
  clearCompletedTasks: () => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.status === 'running' || task.status === 'queued'),
    }));
  },

  // 清除所有任务
  clearAllTasks: () => {
    set({ tasks: [], activeTaskId: null });
  },

  // 开始任务
  startTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status: 'running' as AITaskStatus, startedAt: Date.now(), progress: 0 }
          : task,
      ),
      activeTaskId: taskId,
    }));

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:started', task);
    }
  },

  // 完成任务
  completeTask: (taskId, response) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'success' as AITaskStatus,
              completedAt: Date.now(),
              progress: 100,
              response,
              // 保留 rawOutput 供调试，但清理 currentOutput 节省内存
              rawOutput: task.rawOutput || task.currentOutput || response?.content,
              currentOutput: undefined,
            }
          : task,
      ),
      activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
    }));

    get().refreshStats();

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:completed', task);
    }
  },

  // 任务失败
  failTask: (taskId, error) => {
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        // 将当前输出附加到错误信息中，方便调试
        const errorWithRawOutput: NonNullable<AITask['error']> = {
          message: error?.message ?? 'Unknown error',
          code: error?.code,
          details: error?.details,
          retryable: error?.retryable ?? false,
          rawOutput: error?.rawOutput ?? task.rawOutput ?? task.currentOutput,
        };
        return {
          ...task,
          status: 'error' as AITaskStatus,
          completedAt: Date.now(),
          error: errorWithRawOutput,
        };
      }),
      activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
    }));

    get().refreshStats();

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:failed', task);
    }
  },

  // 取消任务
  cancelTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status: 'cancelled' as AITaskStatus, completedAt: Date.now() }
          : task,
      ),
      activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
    }));

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:cancelled', task);
    }
  },

  // 重试任务
  retryTask: (taskId) => {
    const task = get().getTask(taskId);
    if (!task || task.retryCount >= task.maxRetries) return;

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'queued' as AITaskStatus,
              retryCount: t.retryCount + 1,
              error: undefined,
              completedAt: undefined,
            }
          : t,
      ),
    }));

    get().emit('task:retry', task);
  },

  // 更新进度
  updateProgress: (taskId, progress, currentStep) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, progress, currentStep } : task,
      ),
    }));

    const task = get().getTask(taskId);
    if (task) {
      get().emit('task:progress', task);
    }
  },

  // 更新流式输出（覆盖）
  updateTaskOutput: (taskId, output) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, currentOutput: output, rawOutput: output } : task,
      ),
    }));
  },

  // 追加流式输出（增量）
  appendTaskOutput: (taskId, chunk) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              currentOutput: (task.currentOutput || '') + chunk,
              rawOutput: (task.rawOutput || '') + chunk,
            }
          : task,
      ),
    }));
  },

  // 暂停队列
  pauseQueue: () => set({ isQueuePaused: true }),

  // 恢复队列
  resumeQueue: () => set({ isQueuePaused: false }),

  // 开始批量生成
  startBatchGenerating: (source) => set({ isBatchGenerating: true, batchGeneratingSource: source }),

  // 停止批量生成
  stopBatchGenerating: () => set({ isBatchGenerating: false, batchGeneratingSource: null }),

  // 更新批量操作状态
  updateBatchOperations: (updates) =>
    set((state) => ({
      batchOperations: { ...state.batchOperations, ...updates },
    })),

  // 重置批量操作状态
  resetBatchOperations: () =>
    set(() => ({
      batchOperations: {
        selectedScenes: new Set(),
        isProcessing: false,
        isPaused: false,
        cancelRequested: false,
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
    })),

  // 设置选中的分镜
  setBatchSelectedScenes: (sceneIds) =>
    set((state) => ({
      batchOperations: {
        ...state.batchOperations,
        selectedScenes: new Set(sceneIds),
        totalScenes: sceneIds.length,
      },
    })),

  // 添加完成的分镜
  addBatchCompletedScene: (sceneId) =>
    set((state) => ({
      batchOperations: {
        ...state.batchOperations,
        completedScenes: [...state.batchOperations.completedScenes, sceneId],
        currentScene:
          state.batchOperations.totalScenes > 0
            ? state.batchOperations.completedScenes.length +
              state.batchOperations.failedScenes.length +
              1
            : 0,
        progress:
          state.batchOperations.totalScenes > 0
            ? Math.round(
                ((state.batchOperations.completedScenes.length +
                  state.batchOperations.failedScenes.length +
                  1) /
                  state.batchOperations.totalScenes) *
                  100,
              )
            : 0,
      },
    })),

  // 添加失败的分镜
  addBatchFailedScene: (sceneId) =>
    set((state) => ({
      batchOperations: {
        ...state.batchOperations,
        failedScenes: [...state.batchOperations.failedScenes, sceneId],
        currentScene:
          state.batchOperations.totalScenes > 0
            ? state.batchOperations.completedScenes.length +
              state.batchOperations.failedScenes.length +
              1
            : 0,
        progress:
          state.batchOperations.totalScenes > 0
            ? Math.round(
                ((state.batchOperations.completedScenes.length +
                  state.batchOperations.failedScenes.length +
                  1) /
                  state.batchOperations.totalScenes) *
                  100,
              )
            : 0,
      },
    })),

  // 切换面板
  togglePanel: () => set((state) => ({ isPanelVisible: !state.isPanelVisible })),

  // 显示面板
  showPanel: () => set({ isPanelVisible: true }),

  // 隐藏面板
  hidePanel: () => set({ isPanelVisible: false }),

  // 最小化面板
  minimizePanel: () => set({ isPanelMinimized: true }),

  // 展开面板
  expandPanel: () => set({ isPanelMinimized: false }),

  // 设置过滤器
  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  // 清除过滤器
  clearFilter: () => set({ filter: {} }),

  // 获取单个任务
  getTask: (taskId) => get().tasks.find((t) => t.id === taskId),

  // 获取过滤后的任务
  getFilteredTasks: () => {
    const { tasks, filter } = get();
    return tasks.filter((task) => {
      if (filter.status && !filter.status.includes(task.status)) return false;
      if (filter.type && !filter.type.includes(task.type)) return false;
      if (filter.projectId && task.projectId !== filter.projectId) return false;
      if (filter.timeRange) {
        if (task.createdAt < filter.timeRange.start) return false;
        if (task.createdAt > filter.timeRange.end) return false;
      }
      return true;
    });
  },

  // 获取活跃任务
  getActiveTasks: () => get().tasks.filter((t) => t.status === 'running' || t.status === 'queued'),

  // 获取最近任务
  getRecentTasks: (limit = 20) => get().tasks.slice(0, limit),

  // 刷新统计
  refreshStats: () => {
    set((state) => ({
      stats: calculateStats(state.tasks),
    }));
  },

  // 订阅事件
  subscribe: (event, callback) => {
    const { listeners } = get();
    const eventListeners = listeners.get(event) || [];
    eventListeners.push(callback);
    listeners.set(event, eventListeners);

    // 返回取消订阅函数
    return () => {
      const currentListeners = listeners.get(event) || [];
      listeners.set(
        event,
        currentListeners.filter((cb) => cb !== callback),
      );
    };
  },

  // 发射事件
  emit: (event, task) => {
    const { listeners } = get();
    const eventListeners = listeners.get(event) || [];
    eventListeners.forEach((callback) => {
      try {
        callback(task);
      } catch (err) {
        console.error(`[AIProgress] Event listener error for ${event}:`, err);
      }
    });
  },
}));

// ==========================================
// 辅助Hook
// ==========================================

/**
 * 获取任务类型的中文标签
 */
export function getTaskTypeLabel(type: AICallType): string {
  const labels: Record<AICallType, string> = {
    scene_list_generation: '分镜列表生成',
    scene_description: '场景锚点',
    action_description: '动作描述',
    shot_prompt: '镜头提示词',
    keyframe_prompt: '关键帧提示词（KF0-KF8）',
    motion_prompt: '时空/运动提示词',
    dialogue: '台词生成',
    episode_plan: '剧集规划生成',
    narrative_causal_chain: '叙事因果链生成',
    episode_core_expression: '单集核心表达生成',
    episode_core_expression_batch: '单集核心表达批量生成',
    episode_scene_list: '单集分镜列表生成',
    scene_refine_all: '一键细化',
    storyboard_scene_bible: 'Storyboard：SceneBible',
    storyboard_plan: 'Storyboard：Plan（9组大纲）',
    storyboard_group: 'Storyboard：Group（单组 9 格）',
    storyboard_translate: 'Storyboard：翻译（EN→ZH）',
    storyboard_back_translate: 'Storyboard：回译（ZH→EN）',
    character_basic_info: '角色信息生成',
    character_portrait: '角色定妆照生成',
    custom: '自定义调用',
  };
  return labels[type] || type;
}

/**
 * 获取任务状态的中文标签
 */
export function getTaskStatusLabel(status: AITaskStatus): string {
  const labels: Record<AITaskStatus, string> = {
    queued: '排队中',
    running: '执行中',
    success: '已完成',
    error: '失败',
    cancelled: '已取消',
  };
  return labels[status] || status;
}

/**
 * 获取任务状态的颜色
 */
export function getTaskStatusColor(status: AITaskStatus): string {
  const colors: Record<AITaskStatus, string> = {
    queued: 'text-yellow-500',
    running: 'text-blue-500',
    success: 'text-green-500',
    error: 'text-red-500',
    cancelled: 'text-gray-500',
  };
  return colors[status] || 'text-gray-500';
}

// 暴露到全局对象，方便在控制台调试
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).aiProgress = {
    getStore: () => useAIProgressStore.getState(),
    getTasks: () => useAIProgressStore.getState().tasks,
    getStats: () => useAIProgressStore.getState().stats,
    clearAll: () => useAIProgressStore.getState().clearAllTasks(),
    show: () => useAIProgressStore.getState().showPanel(),
    hide: () => useAIProgressStore.getState().hidePanel(),
  };

  console.log('%c📊 AI进度追踪已加载', 'color: #6366f1; font-weight: bold;');
  console.log('  window.aiProgress.getStore() - 获取完整状态');
  console.log('  window.aiProgress.getTasks() - 获取所有任务');
  console.log('  window.aiProgress.getStats() - 获取统计数据');
  console.log('  window.aiProgress.show() / hide() - 显示/隐藏面板');
}
