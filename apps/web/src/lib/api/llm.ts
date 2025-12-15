import type { ChatMessage, AIResponse } from '@/types';
import { apiRequest } from './http';
import type { ApiAIJob } from './aiJobs';
import { apiWaitForAIJob } from './aiJobs';

function createAbortError(message = 'Aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function normalizeAIResponseFromJob(job: ApiAIJob): AIResponse {
  const result = (job.result ?? null) as any;
  const tokenUsageRaw = result?.tokenUsage ?? null;
  const tokenUsage =
    tokenUsageRaw &&
    typeof tokenUsageRaw === 'object' &&
    typeof tokenUsageRaw.prompt === 'number' &&
    typeof tokenUsageRaw.completion === 'number' &&
    typeof tokenUsageRaw.total === 'number'
      ? {
          prompt: tokenUsageRaw.prompt,
          completion: tokenUsageRaw.completion,
          total: tokenUsageRaw.total,
        }
      : undefined;

  return {
    content: typeof result?.content === 'string' ? result.content : '',
    tokenUsage,
  };
}

export async function apiLlmChat(
  input: { aiProfileId: string; messages: ChatMessage[] },
  options?: {
    /** 允许通过 AbortController 中断轮询并（可选）取消服务端任务 */
    signal?: AbortSignal;
    /** 轮询间隔（默认 800ms） */
    pollIntervalMs?: number;
    /** 最大等待时间（默认 10min） */
    timeoutMs?: number;
    /** abort 时是否向服务端发送 cancel（默认 true） */
    cancelOnAbort?: boolean;
  },
) {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? 10 * 60_000;

  throwIfAborted(signal);

  // 先入队，避免 API 进程同步等待导致 120s 超时
  const enqueued = await apiRequest<{ jobId: string }>('/llm/chat', {
    method: 'POST',
    body: input,
    signal,
  });
  const jobId = enqueued.jobId;

  const job = await apiWaitForAIJob(jobId, {
    signal,
    timeoutMs,
    pollIntervalMs: options?.pollIntervalMs,
    cancelOnAbort: options?.cancelOnAbort,
  });
  return { ...normalizeAIResponseFromJob(job), jobId };
}
