import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiWaitForAIJob } from './aiJobs';
import { apiRequest } from './http';

vi.mock('./http', () => ({
  apiRequest: vi.fn(),
}));

type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

function createJob(status: JobStatus, progress: unknown, error: string | null = null) {
  return {
    id: 'job_ep_1',
    type: 'run_episode_creation_agent',
    status,
    error,
    result: status === 'succeeded' ? { ok: true } : null,
    progress,
    createdAt: '2026-02-11T00:00:00.000Z',
    startedAt: '2026-02-11T00:00:01.000Z',
    finishedAt: status === 'succeeded' ? '2026-02-11T00:00:10.000Z' : null,
  };
}

describe('apiWaitForAIJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-11T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('在无进度变化时应按超时结束', async () => {
    vi.mocked(apiRequest).mockImplementation(async () =>
      createJob('running', { pct: 12, message: 'same' }),
    );

    const p = apiWaitForAIJob('job_ep_1', {
      pollIntervalMs: 5,
      timeoutMs: 8,
    });
    const assertion = expect(p).rejects.toThrow(/AI 任务等待超时/);

    await vi.advanceTimersByTimeAsync(30);
    await assertion;
  });

  it('有持续进度变化时应延长等待直到成功', async () => {
    const samples = [10, 30, 50, 70];
    let cursor = 0;
    vi.mocked(apiRequest).mockImplementation(async () => {
      if (cursor < samples.length) {
        const pct = samples[cursor];
        cursor += 1;
        return createJob('running', { pct, message: `p${pct}` });
      }
      return createJob('succeeded', { pct: 100, message: 'done' });
    });

    const p = apiWaitForAIJob('job_ep_1', {
      pollIntervalMs: 5,
      timeoutMs: 8,
    });
    const assertion = expect(p).resolves.toMatchObject({ status: 'succeeded' });

    await vi.advanceTimersByTimeAsync(40);
    await assertion;
  });
});
