import type { ChatMessage, AIResponse } from '@/types';
import { apiRequest } from './http';
import type { ApiAIJob } from './aiJobs';
import { apiWaitForAIJob } from './aiJobs';

export type ApiResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    };

export type ApiStructuredTestResult = {
  content: string;
  tokenUsage?: AIResponse['tokenUsage'];
  durationMs?: number;
  json?: { ok: boolean; error?: string };
  schema?: { ok: boolean; errors?: string[]; compileError?: string } | null;
};

interface JobResultBase {
  content?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs?: number;
  json?: { ok: boolean; error?: string };
  schema?: { ok: boolean; errors?: string[]; compileError?: string } | null;
}

function createAbortError(message = 'Aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

function normalizeAIResponseFromJob(job: ApiAIJob): AIResponse {
  const result = (job.result ?? null) as JobResultBase | null;
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

function normalizeStructuredTestFromJob(job: ApiAIJob): ApiStructuredTestResult {
  const result = (job.result ?? null) as JobResultBase | null;
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

  const durationMs = typeof result?.durationMs === 'number' ? result.durationMs : undefined;
  const jsonResult = result?.json;
  const schemaResult = result?.schema;

  return {
    content: typeof result?.content === 'string' ? result.content : '',
    tokenUsage,
    durationMs,
    json:
      jsonResult && typeof jsonResult.ok === 'boolean'
        ? { ok: Boolean(jsonResult.ok), ...(typeof jsonResult.error === 'string' ? { error: jsonResult.error } : {}) }
        : undefined,
    schema:
      schemaResult === null
        ? null
        : schemaResult && typeof schemaResult.ok === 'boolean'
          ? {
              ok: Boolean(schemaResult.ok),
              ...(typeof schemaResult.compileError === 'string' ? { compileError: schemaResult.compileError } : {}),
              ...(Array.isArray(schemaResult.errors)
                ? { errors: schemaResult.errors.filter((e: unknown) => typeof e === 'string') as string[] }
                : {}),
            }
          : undefined,
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

export async function apiLlmStructuredTest(
  input: {
    aiProfileId: string;
    messages: ChatMessage[];
    responseFormat: ApiResponseFormat;
    overrideParams?: {
      temperature?: number;
      topP?: number;
      maxTokens?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
      reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    };
  },
  options?: {
    signal?: AbortSignal;
    pollIntervalMs?: number;
    timeoutMs?: number;
    cancelOnAbort?: boolean;
  },
) {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? 10 * 60_000;

  throwIfAborted(signal);

  const enqueued = await apiRequest<{ jobId: string }>('/llm/structured-test', {
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
  return { ...normalizeStructuredTestFromJob(job), jobId };
}
