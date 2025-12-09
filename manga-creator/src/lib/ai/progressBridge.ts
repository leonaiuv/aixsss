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
  dialogue: '生成台词',
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
  dialogue: '生成场景台词和对白',
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

// ==========================================
// Fallback 通知系统
// ==========================================

// Fallback通知类型
export type FallbackReason = 
  | 'api_error'        // API调用失败
  | 'timeout'          // 超时
  | 'parse_error'      // 解析失败
  | 'network_error'    // 网络错误
  | 'unknown';         // 未知错误

// Fallback通知项
export interface FallbackNotification {
  id: string;
  feature: string;        // 功能名称
  reason: FallbackReason; // 降级原因
  message: string;        // 错误信息
  fallbackTo: string;     // 降级到什么
  timestamp: number;
}

// Fallback通知历史
const fallbackHistory: FallbackNotification[] = [];
const MAX_FALLBACK_HISTORY = 50;

// Fallback事件监听器
type FallbackEventCallback = (notification: FallbackNotification) => void;
const fallbackListeners: FallbackEventCallback[] = [];

/**
 * 发送AI Fallback通知
 * 当AI调用失败回退到规则引擎时调用
 */
export function notifyAIFallback(
  feature: string,
  error: Error | string,
  fallbackTo: string = '规则引擎'
): void {
  const message = error instanceof Error ? error.message : error;
  const reason = detectFallbackReason(message);
  
  const notification: FallbackNotification = {
    id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    feature,
    reason,
    message,
    fallbackTo,
    timestamp: Date.now(),
  };
  
  // 添加到历史
  fallbackHistory.unshift(notification);
  if (fallbackHistory.length > MAX_FALLBACK_HISTORY) {
    fallbackHistory.pop();
  }
  
  // 发射事件
  fallbackListeners.forEach(callback => {
    try {
      callback(notification);
    } catch (err) {
      console.error('[Fallback] Event listener error:', err);
    }
  });
  
  // 通过aiProgressStore发送警告任务
  const store = useAIProgressStore.getState();
  const taskId = store.addTask({
    type: 'custom',
    title: `⚠️ ${feature} 已降级`,
    description: `AI调用失败，已回退到${fallbackTo}`,
    status: 'success', // 标记为成功因为fallback本身执行成功了
    priority: 'normal',
    progress: 100,
    currentStep: `原因: ${message}`,
    maxRetries: 0,
  });
  
  // 5秒后自动删除警告任务
  setTimeout(() => {
    store.removeTask(taskId);
  }, 8000);
  
  // 控制台警告
  console.warn(
    `%c⚠️ AI Fallback: ${feature}`,
    'color: #f59e0b; font-weight: bold;',
    `\n原因: ${message}\n降级到: ${fallbackTo}`
  );
}

/**
 * 检测降级原因
 */
function detectFallbackReason(message: string): FallbackReason {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('timeout') || lowerMessage.includes('超时')) {
    return 'timeout';
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('网络')) {
    return 'network_error';
  }
  if (lowerMessage.includes('parse') || lowerMessage.includes('json') || lowerMessage.includes('解析')) {
    return 'parse_error';
  }
  if (lowerMessage.includes('api') || lowerMessage.includes('request') || lowerMessage.includes('请求')) {
    return 'api_error';
  }
  
  return 'unknown';
}

/**
 * 订阅Fallback事件
 */
export function subscribeToFallbackEvents(
  callback: FallbackEventCallback
): () => void {
  fallbackListeners.push(callback);
  return () => {
    const index = fallbackListeners.indexOf(callback);
    if (index > -1) {
      fallbackListeners.splice(index, 1);
    }
  };
}

/**
 * 获取Fallback历史
 */
export function getFallbackHistory(): FallbackNotification[] {
  return [...fallbackHistory];
}

/**
 * 清空Fallback历史
 */
export function clearFallbackHistory(): void {
  fallbackHistory.length = 0;
}

// 暴露到全局对象
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).aiProgressBridge = {
    init: initProgressBridge,
    createTask: createProgressTask,
  };
}
