/**
 * AI进度桥接器
 * 连接debugLogger和aiProgressStore，实现实时进度追踪
 */
import { 
  subscribeToAIEvents, 
  type AICallLogEntry,
  type AICallType,
} from './debugLogger';
import { useAIProgressStore, type AITask } from '@/stores/aiProgressStore';

// 日志ID到任务ID的映射
const logToTaskMap: Map<string, string> = new Map();

// AI调用类型到任务标题的映射
const callTypeToTitle: Record<AICallType, string> = {
  scene_list_generation: '生成分镜列表',
  scene_description: '生成场景描述',
  action_description: '生成动作描述',
  shot_prompt: '生成镜头提示词',
  keyframe_prompt: '生成关键帧提示词',
  motion_prompt: '生成时空提示词',
  custom: '自定义AI调用',
};

// AI调用类型到描述的映射
const callTypeToDesc: Record<AICallType, string> = {
  scene_list_generation: '将故事拆解为关键分镜节点',
  scene_description: '根据分镜概要生成详细场景描述',
  action_description: '描述角色的具体动作',
  shot_prompt: '生成适合绘图AI的镜头描述',
  keyframe_prompt: '生成静态关键帧图片描述',
  motion_prompt: '生成动作/镜头/变化描述',
  custom: '执行自定义AI操作',
};

/**
 * 初始化进度桥接器
 * 订阅debugLogger事件并同步到进度追踪Store
 */
export function initProgressBridge(): () => void {
  const store = useAIProgressStore.getState();
  const unsubscribers: (() => void)[] = [];
  
  // 订阅调用开始事件
  unsubscribers.push(
    subscribeToAIEvents('call:start', (entry: AICallLogEntry) => {
      const taskId = store.addTask({
        type: entry.callType,
        title: callTypeToTitle[entry.callType] || entry.callType,
        description: callTypeToDesc[entry.callType],
        status: 'running',
        priority: 'normal',
        progress: 10,
        currentStep: '正在发送请求...',
        projectId: entry.context.projectId,
        sceneId: entry.context.sceneId,
        sceneOrder: entry.context.sceneOrder,
        maxRetries: 3,
      });
      
      logToTaskMap.set(entry.id, taskId);
    })
  );
  
  // 订阅调用成功事件
  unsubscribers.push(
    subscribeToAIEvents('call:success', (entry: AICallLogEntry, extra?: unknown) => {
      const taskId = logToTaskMap.get(entry.id);
      if (taskId) {
        const response = extra as AITask['response'];
        store.completeTask(taskId, response);
        logToTaskMap.delete(entry.id);
      }
    })
  );
  
  // 订阅调用失败事件
  unsubscribers.push(
    subscribeToAIEvents('call:error', (entry: AICallLogEntry, extra?: unknown) => {
      const taskId = logToTaskMap.get(entry.id);
      if (taskId) {
        const errorData = extra as { message: string } | undefined;
        store.failTask(taskId, {
          message: errorData?.message || entry.error || '未知错误',
          retryable: true,
        });
        logToTaskMap.delete(entry.id);
      }
    })
  );
  
  // 订阅进度更新事件
  unsubscribers.push(
    subscribeToAIEvents('call:progress', (entry: AICallLogEntry, extra?: unknown) => {
      const taskId = logToTaskMap.get(entry.id);
      if (taskId) {
        const progressData = extra as { progress: number; step?: string } | undefined;
        if (progressData) {
          store.updateProgress(taskId, progressData.progress, progressData.step);
        }
      }
    })
  );
  
  console.log('[Progress Bridge] 已初始化AI进度桥接器');
  
  // 返回清理函数
  return () => {
    unsubscribers.forEach(unsub => unsub());
    logToTaskMap.clear();
    console.log('[Progress Bridge] 已清理AI进度桥接器');
  };
}

/**
 * 手动创建进度任务（用于不通过debugLogger的调用）
 */
export function createProgressTask(
  type: AICallType,
  context?: {
    projectId?: string;
    sceneId?: string;
    sceneOrder?: number;
  }
): {
  taskId: string;
  updateProgress: (progress: number, step?: string) => void;
  complete: (response?: AITask['response']) => void;
  fail: (error: string) => void;
} {
  const store = useAIProgressStore.getState();
  
  const taskId = store.addTask({
    type,
    title: callTypeToTitle[type] || type,
    description: callTypeToDesc[type],
    status: 'running',
    priority: 'normal',
    progress: 0,
    currentStep: '准备中...',
    projectId: context?.projectId,
    sceneId: context?.sceneId,
    sceneOrder: context?.sceneOrder,
    maxRetries: 3,
  });
  
  return {
    taskId,
    updateProgress: (progress: number, step?: string) => {
      store.updateProgress(taskId, progress, step);
    },
    complete: (response?: AITask['response']) => {
      store.completeTask(taskId, response);
    },
    fail: (error: string) => {
      store.failTask(taskId, { message: error, retryable: true });
    },
  };
}

// 暴露到全局对象
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).aiProgressBridge = {
    init: initProgressBridge,
    createTask: createProgressTask,
  };
}
