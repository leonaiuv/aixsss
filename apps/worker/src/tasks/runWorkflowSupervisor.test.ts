import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./expandStoryCharacters.js', () => ({
  expandStoryCharacters: vi.fn(),
}));

vi.mock('./buildNarrativeCausalChain.js', () => ({
  buildNarrativeCausalChain: vi.fn(),
}));

vi.mock('./generateCharacterRelationships.js', () => ({
  generateCharacterRelationships: vi.fn(),
}));

vi.mock('./generateEmotionArc.js', () => ({
  generateEmotionArc: vi.fn(),
}));

vi.mock('../agents/runtime/featureFlags.js', () => ({
  isAgentSupervisorEnabled: () => true,
  isAgentFallbackToLegacyEnabled: () => true,
  getAgentMaxSteps: () => 4,
  getAgentStepTimeoutMs: () => 30_000,
  getAgentTotalTimeoutMs: () => 120_000,
}));

vi.mock('../agents/runtime/jsonToolLoop.js', () => ({
  runJsonToolLoop: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

vi.mock('./systemPrompts.js', () => ({
  loadSystemPrompt: vi.fn().mockResolvedValue('system prompt'),
}));

import { expandStoryCharacters } from './expandStoryCharacters.js';
import { buildNarrativeCausalChain } from './buildNarrativeCausalChain.js';
import { generateCharacterRelationships } from './generateCharacterRelationships.js';
import { generateEmotionArc } from './generateEmotionArc.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import { runWorkflowSupervisor } from './runWorkflowSupervisor.js';

function createPrismaMock(completedPhase: number) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'p1',
        contextCache: {
          narrativeCausalChain: {
            version: '2.0.0',
            validationStatus: 'incomplete',
            revisionSuggestions: [],
            completedPhase,
            outlineSummary: '故事',
            conflictEngine: { coreObjectOrEvent: '账册', stakesByFaction: {}, necessityDerivation: [] },
            infoVisibilityLayers: [],
            characterMatrix: [],
            beatFlow: null,
            plotLines: [],
            consistencyChecks: null,
          },
        },
      }),
    },
    aIProfile: {
      findFirst: vi.fn().mockResolvedValue({
        provider: 'openai_compatible',
        model: 'test-model',
        baseURL: null,
        apiKeyEncrypted: 'x',
        generationParams: null,
      }),
    },
    aIJob: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('runWorkflowSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (runJsonToolLoop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      final: { proceed: true },
      executionMode: 'agent',
      fallbackUsed: false,
      trace: {
        version: 1,
        executionMode: 'agent',
        fallbackUsed: false,
        startedAt: '2026-02-10T00:00:00.000Z',
        finishedAt: '2026-02-10T00:00:01.000Z',
        totalDurationMs: 1000,
        steps: [
          {
            index: 1,
            kind: 'final',
            startedAt: '2026-02-10T00:00:00.000Z',
            finishedAt: '2026-02-10T00:00:01.000Z',
            durationMs: 1000,
          },
        ],
      },
    });
    (expandStoryCharacters as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      executionMode: 'agent',
      fallbackUsed: false,
    });
    (buildNarrativeCausalChain as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      executionMode: 'agent',
      fallbackUsed: false,
    });
    (generateCharacterRelationships as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (generateEmotionArc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('should run character expansion + narrative phase3/4 + relationship + emotion in order', async () => {
    const prisma = createPrismaMock(2);
    const res = await runWorkflowSupervisor({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(runJsonToolLoop).toHaveBeenCalledTimes(1);
    expect(expandStoryCharacters).toHaveBeenCalledTimes(1);
    expect(buildNarrativeCausalChain).toHaveBeenCalledTimes(2);
    expect(buildNarrativeCausalChain).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ phase: 3 }),
    );
    expect(buildNarrativeCausalChain).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ phase: 4 }),
    );
    expect(generateCharacterRelationships).toHaveBeenCalledTimes(1);
    expect(generateEmotionArc).toHaveBeenCalledTimes(1);
    expect(res.executionMode).toBe('agent');
    expect(Array.isArray(res.stepSummaries)).toBe(true);
    expect(res.stepSummaries.length).toBeGreaterThanOrEqual(4);
  });

  it('should skip phase3/4 when completedPhase already >= 4', async () => {
    const prisma = createPrismaMock(4);
    const res = await runWorkflowSupervisor({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(buildNarrativeCausalChain).not.toHaveBeenCalled();
    expect(expandStoryCharacters).toHaveBeenCalledTimes(1);
    expect(generateCharacterRelationships).toHaveBeenCalledTimes(1);
    expect(generateEmotionArc).toHaveBeenCalledTimes(1);
    expect(
      res.stepSummaries.some((x: { step: string; status: string }) => x.step === 'narrative_phase3' && x.status === 'skipped'),
    ).toBe(true);
    expect(
      res.stepSummaries.some((x: { step: string; status: string }) => x.step === 'narrative_phase4' && x.status === 'skipped'),
    ).toBe(true);
  });

  it('should stop immediately when one step fails', async () => {
    const prisma = createPrismaMock(2);
    (buildNarrativeCausalChain as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('phase3 failed'),
    );

    await expect(
      runWorkflowSupervisor({
        prisma: prisma as never,
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
        apiKeySecret: 'secret',
        updateProgress: async () => {},
      }),
    ).rejects.toThrow(/narrative_phase3/);

    expect(generateCharacterRelationships).not.toHaveBeenCalled();
    expect(generateEmotionArc).not.toHaveBeenCalled();
  });

  it('should reject when another supervisor job is already running on same project', async () => {
    const prisma = createPrismaMock(2);
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'job_other',
    });

    await expect(
      runWorkflowSupervisor({
        prisma: prisma as never,
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
        apiKeySecret: 'secret',
        currentJobId: 'job_current',
        updateProgress: async () => {},
      }),
    ).rejects.toThrow(/already running/i);

    expect(expandStoryCharacters).not.toHaveBeenCalled();
    expect(buildNarrativeCausalChain).not.toHaveBeenCalled();
  });
});
