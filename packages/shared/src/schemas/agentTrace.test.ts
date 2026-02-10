import { describe, expect, it } from 'vitest';
import { AgentTraceSchema } from './agentTrace.js';

describe('AgentTrace schema', () => {
  it('accepts valid trace', () => {
    const parsed = AgentTraceSchema.parse({
      version: 1,
      executionMode: 'agent',
      fallbackUsed: false,
      startedAt: '2026-02-10T12:00:00.000Z',
      finishedAt: '2026-02-10T12:00:02.000Z',
      totalDurationMs: 2000,
      steps: [
        {
          index: 1,
          kind: 'tool_call',
          startedAt: '2026-02-10T12:00:00.000Z',
          finishedAt: '2026-02-10T12:00:01.000Z',
          durationMs: 1000,
          toolCall: {
            name: 'read_project_summary',
            input: { projectId: 'p1' },
            output: { summary: 'x' },
            status: 'ok',
          },
        },
        {
          index: 2,
          kind: 'final',
          startedAt: '2026-02-10T12:00:01.000Z',
          finishedAt: '2026-02-10T12:00:02.000Z',
          durationMs: 1000,
          final: { candidates: [] },
        },
      ],
    });

    expect(parsed.executionMode).toBe('agent');
    expect(parsed.steps).toHaveLength(2);
  });

  it('rejects invalid step shape', () => {
    expect(() =>
      AgentTraceSchema.parse({
        version: 1,
        executionMode: 'agent',
        fallbackUsed: false,
        startedAt: '2026-02-10T12:00:00.000Z',
        finishedAt: '2026-02-10T12:00:02.000Z',
        totalDurationMs: 2000,
        steps: [
          {
            index: 1,
            kind: 'tool_call',
            durationMs: 1000,
          },
        ],
      }),
    ).toThrow();
  });
});
