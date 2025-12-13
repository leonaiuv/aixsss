import { subscribeToAIEvents, type AICallLogEntry } from './debugLogger';
import { useAIUsageStore, type AIUsageEvent } from '@/stores/aiUsageStore';

// logId -> startedAt(ms)
const startTimeMap: Map<string, number> = new Map();

function buildBaseEvent(entry: AICallLogEntry, completedAt: number): Omit<AIUsageEvent, 'status'> {
  const startedAt = startTimeMap.get(entry.id);
  const durationMs = typeof startedAt === 'number' ? Math.max(0, completedAt - startedAt) : undefined;

  return {
    id: entry.id,
    callType: entry.callType,
    profileId: entry.config.profileId,
    provider: entry.config.provider,
    model: entry.config.model,
    projectId: entry.context.projectId,
    sceneId: entry.context.sceneId,
    sceneOrder: entry.context.sceneOrder,
    startedAt,
    completedAt,
    durationMs,
  };
}

/**
 * 初始化 AI 用量追踪（持久化到 localStorage）
 * - 不保存提示词/上下文正文，仅保存元数据与 token/耗时
 * - 方便在“统计分析”里展示真实口径
 */
export function initAIUsageAnalytics(): () => void {
  const unsubscribers: Array<() => void> = [];
  const store = useAIUsageStore.getState();

  unsubscribers.push(
    subscribeToAIEvents('call:start', (entry: AICallLogEntry) => {
      startTimeMap.set(entry.id, Date.now());
    })
  );

  unsubscribers.push(
    subscribeToAIEvents('call:success', (entry: AICallLogEntry, extra?: unknown) => {
      const completedAt = Date.now();
      const response = extra as { tokenUsage?: AIUsageEvent['tokenUsage'] } | undefined;

      store.recordEvent({
        ...buildBaseEvent(entry, completedAt),
        status: 'success',
        tokenUsage: response?.tokenUsage ?? entry.response?.tokenUsage,
      });

      startTimeMap.delete(entry.id);
    })
  );

  unsubscribers.push(
    subscribeToAIEvents('call:error', (entry: AICallLogEntry, extra?: unknown) => {
      const completedAt = Date.now();
      const errorData = extra as { message?: string } | undefined;

      store.recordEvent({
        ...buildBaseEvent(entry, completedAt),
        status: 'error',
        errorMessage: errorData?.message ?? entry.error,
      });

      startTimeMap.delete(entry.id);
    })
  );

  return () => {
    unsubscribers.forEach((unsub) => unsub());
    startTimeMap.clear();
  };
}
