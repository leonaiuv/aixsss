import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

vi.mock('../agents/runtime/featureFlags.js', () => ({
  isAgentCharacterExpansionEnabled: vi.fn(() => true),
  isAgentFallbackToLegacyEnabled: vi.fn(() => true),
  getAgentMaxSteps: vi.fn(() => 4),
  getAgentStepTimeoutMs: vi.fn(() => 2000),
  getAgentTotalTimeoutMs: vi.fn(() => 10000),
}));

vi.mock('../agents/runtime/jsonToolLoop.js', () => ({
  runJsonToolLoop: vi.fn(),
}));

vi.mock('./systemPrompts.js', () => ({
  loadSystemPrompt: vi.fn().mockResolvedValue('test-system-prompt'),
}));

import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import { expandStoryCharacters } from './expandStoryCharacters.js';

describe('expandStoryCharacters agent mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes candidates from agent final result', async () => {
    type TaskArgs = Parameters<typeof expandStoryCharacters>[0];

    (runJsonToolLoop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      final: {
        parsed: {
          candidates: [
            {
              name: '新角色A',
              roleType: 'supporting',
              briefDescription: '补充角色',
              confidence: 0.9,
              evidence: ['phase3'],
            },
          ],
        },
        extractedJson: '{"candidates":[{"name":"新角色A"}]}',
        tokenUsage: null,
      },
      executionMode: 'agent',
      fallbackUsed: false,
      trace: {
        version: 1,
        executionMode: 'agent',
        fallbackUsed: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        totalDurationMs: 120,
        steps: [{ index: 1, kind: 'final' }],
      },
      tokenUsage: { prompt: 3, completion: 2, total: 5 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: 'summary',
          protagonist: '主角',
          style: 'anime',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: { completedPhase: 3 } },
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', name: '主角', briefDescription: '主角', appearance: '', personality: '', background: '' },
        ]),
      },
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'openai_compatible',
          model: 'test',
          baseURL: null,
          apiKeyEncrypted: 'x',
          generationParams: null,
        }),
      },
      systemPrompt: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await expandStoryCharacters({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      maxNewCharacters: 8,
      updateProgress: async () => {},
    });

    expect(result.executionMode).toBe('agent');
    expect(result.fallbackUsed).toBe(false);
    expect(result.candidateCount).toBe(1);
    expect(result.stepSummaries.length).toBeGreaterThan(0);
    expect(prisma.project.update).toHaveBeenCalledTimes(1);
  });

  it('marks fallback when agent runtime returns legacy mode', async () => {
    type TaskArgs = Parameters<typeof expandStoryCharacters>[0];

    (runJsonToolLoop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      final: {
        parsed: {
          candidates: [
            {
              name: '回退角色',
              roleType: 'supporting',
              briefDescription: '来自回退',
              confidence: 0.85,
              evidence: ['legacy'],
            },
          ],
        },
        extractedJson: '{"candidates":[{"name":"回退角色"}]}',
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      },
      executionMode: 'legacy',
      fallbackUsed: true,
      trace: {
        version: 1,
        executionMode: 'legacy',
        fallbackUsed: true,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        totalDurationMs: 300,
        steps: [{ index: 1, kind: 'fallback' }],
      },
      tokenUsage: { prompt: 2, completion: 2, total: 4 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: 'summary',
          protagonist: '主角',
          style: 'anime',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: { completedPhase: 3 } },
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      aIProfile: {
        findFirst: vi.fn().mockResolvedValue({
          provider: 'openai_compatible',
          model: 'test',
          baseURL: null,
          apiKeyEncrypted: 'x',
          generationParams: null,
        }),
      },
      systemPrompt: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const result = await expandStoryCharacters({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      maxNewCharacters: 8,
      updateProgress: async () => {},
    });

    expect(result.executionMode).toBe('legacy');
    expect(result.fallbackUsed).toBe(true);
    expect(result.tokenUsage).toEqual({ prompt: 3, completion: 3, total: 6 });
  });
});
