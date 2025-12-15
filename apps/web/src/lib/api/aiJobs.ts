import { apiRequest } from './http';

export type ApiAIJob = {
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

export async function apiGetAIJob(jobId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<ApiAIJob>(`/ai-jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    signal: options?.signal,
  });
}

export async function apiWaitForAIJob(
  jobId: string,
  options?: {
    signal?: AbortSignal;
    pollIntervalMs?: number;
    timeoutMs?: number;
    cancelOnAbort?: boolean;
  },
) {
  const signal = options?.signal;
  const pollIntervalMs = options?.pollIntervalMs ?? 800;
  const timeoutMs = options?.timeoutMs ?? 10 * 60_000;
  const cancelOnAbort = options?.cancelOnAbort ?? true;

  throwIfAborted(signal);

  const deadline = Date.now() + timeoutMs;
  let lastStatus: ApiAIJob['status'] | null = null;

  try {
    while (true) {
      throwIfAborted(signal);

      const job = await apiGetAIJob(jobId, { signal });
      lastStatus = job.status;

      if (job.status === 'succeeded') return job;
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
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort && cancelOnAbort) {
      try {
        await apiRequest<{ ok: true }>(`/ai-jobs/${encodeURIComponent(jobId)}/cancel`, {
          method: 'POST',
          signal: undefined,
        });
      } catch {
        // best-effort
      }
    }
    throw err;
  }
}
