import { create } from 'zustand';
import type { AICallType } from '@/lib/ai/debugLogger';
import type { AIPricing } from '@/types';

const STORAGE_KEY = 'aixs_ai_usage_events_v1';
const MAX_EVENTS = 2000;

export type AIUsageStatus = 'success' | 'error';

export interface AIUsageEvent {
  id: string;
  callType: AICallType;
  status: AIUsageStatus;

  profileId?: string;
  provider: string;
  model: string;

  projectId?: string;
  sceneId?: string;
  sceneOrder?: number;

  startedAt?: number;
  completedAt: number;
  durationMs?: number;

  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };

  errorMessage?: string;
}

export interface AIUsageStats {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  successRate: number; // 0-100

  avgDurationMs: number;
  p95DurationMs: number;

  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  tokenizedCalls: number;
  unknownTokenCalls: number;
}

export interface AIUsageFilter {
  projectId?: string;
  from?: number;
  to?: number;
}

export const DEFAULT_COST_PER_1K_TOKENS_USD = 0.002;

export function estimateUsageCostUSD(
  events: AIUsageEvent[],
  pricingByProfileId?: Record<string, AIPricing | undefined>
): number {
  let cost = 0;

  for (const event of events) {
    if (!event.tokenUsage) continue;

    const pricing = event.profileId ? pricingByProfileId?.[event.profileId] : undefined;
    if (pricing && pricing.currency === 'USD') {
      cost += (event.tokenUsage.prompt / 1000) * pricing.promptPer1K;
      cost += (event.tokenUsage.completion / 1000) * pricing.completionPer1K;
      continue;
    }

    cost += (event.tokenUsage.total / 1000) * DEFAULT_COST_PER_1K_TOKENS_USD;
  }

  return cost;
}

function safeLoadEvents(): AIUsageEvent[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AIUsageEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object')
      .filter((e) => typeof (e as AIUsageEvent).id === 'string')
      .slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

function safeSaveEvents(events: AIUsageEvent[]): AIUsageEvent[] {
  if (typeof localStorage === 'undefined') return events;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return events;
  } catch {
    // 如果写入失败（配额不足等），尝试丢弃旧数据再写一次
    const half = events.slice(0, Math.max(50, Math.floor(events.length / 2)));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
      return half;
    } catch {
      return events;
    }
  }
}

export function filterUsageEvents(
  events: AIUsageEvent[],
  filter: AIUsageFilter
): AIUsageEvent[] {
  return events.filter((event) => {
    if (filter.projectId && event.projectId !== filter.projectId) return false;
    if (filter.from && event.completedAt < filter.from) return false;
    if (filter.to && event.completedAt > filter.to) return false;
    return true;
  });
}

export function calculateUsageStats(events: AIUsageEvent[]): AIUsageStats {
  const totalCalls = events.length;
  const successCount = events.filter((e) => e.status === 'success').length;
  const errorCount = events.filter((e) => e.status === 'error').length;

  const durations = events
    .map((e) => e.durationMs)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  const avgDurationMs =
    durations.length === 0 ? 0 : durations.reduce((sum, v) => sum + v, 0) / durations.length;

  const p95DurationMs =
    durations.length === 0 ? 0 : durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let tokenizedCalls = 0;

  for (const event of events) {
    if (!event.tokenUsage) continue;
    tokenizedCalls += 1;
    promptTokens += event.tokenUsage.prompt;
    completionTokens += event.tokenUsage.completion;
    totalTokens += event.tokenUsage.total;
  }

  return {
    totalCalls,
    successCount,
    errorCount,
    successRate: totalCalls === 0 ? 0 : (successCount / totalCalls) * 100,
    avgDurationMs,
    p95DurationMs,
    promptTokens,
    completionTokens,
    totalTokens,
    tokenizedCalls,
    unknownTokenCalls: totalCalls - tokenizedCalls,
  };
}

interface AIUsageStoreState {
  events: AIUsageEvent[];
}

interface AIUsageStoreActions {
  recordEvent: (event: AIUsageEvent) => void;
  clearEvents: () => void;
  reload: () => void;
}

export const useAIUsageStore = create<AIUsageStoreState & AIUsageStoreActions>((set) => ({
  events: safeLoadEvents(),

  recordEvent: (event) =>
    set((state) => {
      const next = [event, ...state.events].slice(0, MAX_EVENTS);
      const persisted = safeSaveEvents(next);
      return { events: persisted };
    }),

  clearEvents: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ events: [] });
  },

  reload: () => {
    set({ events: safeLoadEvents() });
  },
}));
