import type { ChatMessage, AIResponse } from '@/types';
import { apiRequest } from './http';

type ApiAIJob = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error: string | null;
  result: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function createAbortError(message = 'Aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

async function abortableSleep(ms: number, signal?: AbortSignal) {
  if (!signal) {
    await sleep(ms);
    return;
  }

  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      clearTimeout(t);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
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
      ? { prompt: tokenUsageRaw.prompt, completion: tokenUsageRaw.completion, total: tokenUsageRaw.total }
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
  }
) {
  const signal = options?.signal;
  const pollIntervalMs = options?.pollIntervalMs ?? 800;
  const timeoutMs = options?.timeoutMs ?? 10 * 60_000;
  const cancelOnAbort = options?.cancelOnAbort ?? true;

  throwIfAborted(signal);

  // 先入队，避免 API 进程同步等待导致 120s 超时
  const enqueued = await apiRequest<{ jobId: string }>('/llm/chat', {
    method: 'POST',
    body: input,
    signal,
  });
  const jobId = enqueued.jobId;

  // 轮询等待结果：默认最多等 10 分钟
  const deadline = Date.now() + timeoutMs;
  let lastStatus: ApiAIJob['status'] | null = null;

  try {
    while (true) {
      throwIfAborted(signal);

      const job = await apiRequest<ApiAIJob>(`/ai-jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        signal,
      });
      lastStatus = job.status;

      if (job.status === 'succeeded') {
        return { ...normalizeAIResponseFromJob(job), jobId };
      }

      if (job.status === 'failed' || job.status === 'cancelled') {
        const message = job.error || `AI 任务失败（status=${job.status}）`;
        throw new Error(message);
      }

      if (Date.now() > deadline) {
        throw new Error(`AI 任务等待超时（jobId=${jobId}, status=${lastStatus ?? 'unknown'}）`);
      }

      await abortableSleep(pollIntervalMs, signal);
    }
  } catch (err) {
    // abort：best-effort 取消服务端任务
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort && cancelOnAbort) {
      try {
        await apiRequest<{ ok: true }>(`/ai-jobs/${encodeURIComponent(jobId)}/cancel`, {
          method: 'POST',
          signal: undefined, // 避免已 abort 的 signal 影响 cancel 请求
        });
      } catch {
        // best-effort
      }
    }
    throw err;
  }
}



