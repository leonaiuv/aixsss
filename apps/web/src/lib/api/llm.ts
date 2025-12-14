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

export async function apiLlmChat(input: { aiProfileId: string; messages: ChatMessage[] }) {
  // 先入队，避免 API 进程同步等待导致 120s 超时
  const enqueued = await apiRequest<{ jobId: string }>('/llm/chat', { method: 'POST', body: input });
  const jobId = enqueued.jobId;

  // 轮询等待结果：默认最多等 10 分钟
  const deadline = Date.now() + 10 * 60_000;
  let lastStatus: ApiAIJob['status'] | null = null;

  while (true) {
    const job = await apiRequest<ApiAIJob>(`/ai-jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
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

    await sleep(800);
  }
}



