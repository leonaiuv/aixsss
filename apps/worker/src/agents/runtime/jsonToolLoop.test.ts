import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../providers/types.js';
import { runJsonToolLoop, type AgentToolMap } from './jsonToolLoop.js';

describe('runJsonToolLoop', () => {
  it('runs tool loop and returns final payload', async () => {
    const callModel = vi
      .fn(
        async (): Promise<{
          content: string;
          tokenUsage?: { prompt: number; completion: number; total: number };
        }> => ({ content: '' }),
      )
      .mockResolvedValueOnce({
        content: JSON.stringify({
          kind: 'tool_call',
          toolName: 'echo',
          toolInput: { value: 'hello' },
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          kind: 'final',
          final: { ok: true, value: 'done' },
        }),
        tokenUsage: { prompt: 8, completion: 4, total: 12 },
      });

    const tools: AgentToolMap = {
      echo: {
        description: 'echo value',
        execute: async (input) => ({ echoed: (input as { value: string }).value }),
      },
    };

    const res = await runJsonToolLoop<{ ok: boolean; value: string }>({
      initialMessages: [{ role: 'system', content: 'test' }],
      callModel: callModel as unknown as (
        messages: ChatMessage[],
        context: { stepIndex: number },
      ) => Promise<{ content: string; tokenUsage?: { prompt: number; completion: number; total: number } }>,
      tools,
      maxSteps: 4,
      totalTimeoutMs: 10_000,
    });

    expect(res.final.ok).toBe(true);
    expect(res.executionMode).toBe('agent');
    expect(res.fallbackUsed).toBe(false);
    expect(res.trace.steps).toHaveLength(2);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(res.tokenUsage?.total).toBe(27);
  });

  it('falls back when tool is unknown', async () => {
    const callModel = vi.fn(async (): Promise<{ content: string }> => ({ content: '' })).mockResolvedValue({
      content: JSON.stringify({
        kind: 'tool_call',
        toolName: 'missing_tool',
        toolInput: {},
      }),
    });

    const fallback = vi.fn().mockResolvedValue({
      final: { mode: 'legacy' },
      reason: 'use legacy path',
    });

    const res = await runJsonToolLoop<{ mode: string }>({
      initialMessages: [{ role: 'system', content: 'test' }],
      callModel,
      tools: {},
      maxSteps: 2,
      totalTimeoutMs: 10_000,
      fallback,
      fallbackEnabled: true,
    });

    expect(res.executionMode).toBe('legacy');
    expect(res.fallbackUsed).toBe(true);
    expect(res.final.mode).toBe('legacy');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('throws when max steps reached and fallback is disabled', async () => {
    const callModel = vi.fn(async (): Promise<{ content: string }> => ({ content: '' })).mockResolvedValue({
      content: JSON.stringify({
        kind: 'tool_call',
        toolName: 'echo',
        toolInput: { value: 'loop' },
      }),
    });

    const tools: AgentToolMap = {
      echo: {
        description: 'echo value',
        execute: async (input) => ({ echoed: (input as { value: string }).value }),
      },
    };

    await expect(
      runJsonToolLoop({
        initialMessages: [{ role: 'system', content: 'test' }],
        callModel,
        tools,
        maxSteps: 2,
        totalTimeoutMs: 10_000,
        fallbackEnabled: false,
      }),
    ).rejects.toThrow('Agent reached max steps');
  });
});
