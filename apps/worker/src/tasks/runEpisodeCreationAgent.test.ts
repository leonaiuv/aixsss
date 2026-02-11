import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./generateEpisodeCoreExpression.js', () => ({
  generateEpisodeCoreExpression: vi.fn(),
}));

vi.mock('./generateSceneScript.js', () => ({
  generateSceneScript: vi.fn(),
}));

vi.mock('./generateEpisodeSceneList.js', () => ({
  generateEpisodeSceneList: vi.fn(),
}));

vi.mock('./refineSceneAll.js', () => ({
  refineSceneAll: vi.fn(),
}));

vi.mock('./generateSoundDesign.js', () => ({
  generateSoundDesign: vi.fn(),
}));

vi.mock('./estimateDuration.js', () => ({
  estimateDuration: vi.fn(),
}));

vi.mock('../agents/runtime/featureFlags.js', () => ({
  isAgentEpisodeCreationEnabled: () => true,
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

import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import { generateEpisodeCoreExpression } from './generateEpisodeCoreExpression.js';
import { generateSceneScript } from './generateSceneScript.js';
import { generateEpisodeSceneList } from './generateEpisodeSceneList.js';
import { refineSceneAll } from './refineSceneAll.js';
import { generateSoundDesign } from './generateSoundDesign.js';
import { estimateDuration } from './estimateDuration.js';
import { runEpisodeCreationAgent } from './runEpisodeCreationAgent.js';

describe('runEpisodeCreationAgent', () => {
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
        steps: [],
      },
    });
    (generateEpisodeCoreExpression as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (generateSceneScript as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (generateEpisodeSceneList as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (refineSceneAll as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (generateSoundDesign as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (estimateDuration as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  function createPrismaMock(input?: {
    episodeCoreExpression?: unknown;
    sceneScriptDraft?: unknown;
    sceneFindManySequence?: Array<Array<Record<string, unknown>>>;
    runningConflict?: boolean;
  }) {
    const sceneSeq =
      input?.sceneFindManySequence ??
      [
        [],
        [
          { id: 's1', order: 1, status: 'pending', soundDesignJson: null, durationEstimateJson: null },
          { id: 's2', order: 2, status: 'pending', soundDesignJson: null, durationEstimateJson: null },
        ],
        [
          { id: 's1', order: 1, status: 'completed', soundDesignJson: null, durationEstimateJson: null },
          { id: 's2', order: 2, status: 'completed', soundDesignJson: null, durationEstimateJson: null },
        ],
      ];

    const sceneFindMany = vi.fn();
    for (const item of sceneSeq) {
      sceneFindMany.mockResolvedValueOnce(item);
    }
    sceneFindMany.mockResolvedValue(sceneSeq[sceneSeq.length - 1] ?? []);

    return {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: 'project summary',
          style: 'anime',
          artStyleConfig: null,
          contextCache: null,
        }),
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'e1',
          order: 1,
          title: 'ep1',
          summary: 'ep1 summary',
          outline: null,
          coreExpression: input?.episodeCoreExpression ?? null,
          sceneScriptDraft: input?.sceneScriptDraft ?? '',
        }),
      },
      scene: {
        findMany: sceneFindMany,
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
        findFirst: vi.fn().mockResolvedValue(input?.runningConflict ? { id: 'job_other' } : null),
      },
    };
  }

  it('should generate five steps progressively and persist via existing task executors', async () => {
    const prisma = createPrismaMock();
    const res = await runEpisodeCreationAgent({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(runJsonToolLoop).toHaveBeenCalledTimes(1);
    expect(generateEpisodeCoreExpression).toHaveBeenCalledTimes(1);
    expect(generateSceneScript).toHaveBeenCalledTimes(1);
    expect(generateEpisodeSceneList).toHaveBeenCalledTimes(1);
    expect(refineSceneAll).toHaveBeenCalledTimes(2);
    expect(refineSceneAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        options: { includeSoundDesign: false, includeDurationEstimate: false },
      }),
    );
    expect(generateSoundDesign).toHaveBeenCalledTimes(2);
    expect(estimateDuration).toHaveBeenCalledTimes(2);
    expect(res.executionMode).toBe('agent');
    expect(res.fallbackUsed).toBe(false);
    expect(res.stepSummaries).toHaveLength(5);
  });

  it('should skip steps that are already completed and avoid unnecessary writes', async () => {
    const prisma = createPrismaMock({
      episodeCoreExpression: { theme: 'x' },
      sceneScriptDraft: 'existing script',
      sceneFindManySequence: [
        [{ id: 's1', order: 1, status: 'completed', soundDesignJson: { cues: [] }, durationEstimateJson: { totalSec: 8 } }],
        [{ id: 's1', order: 1, status: 'completed', soundDesignJson: { cues: [] }, durationEstimateJson: { totalSec: 8 } }],
      ],
    });

    const res = await runEpisodeCreationAgent({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(generateEpisodeCoreExpression).not.toHaveBeenCalled();
    expect(generateSceneScript).not.toHaveBeenCalled();
    expect(generateEpisodeSceneList).not.toHaveBeenCalled();
    expect(refineSceneAll).not.toHaveBeenCalled();
    expect(generateSoundDesign).not.toHaveBeenCalled();
    expect(estimateDuration).not.toHaveBeenCalled();
    expect(res.stepSummaries.some((s) => s.status === 'skipped')).toBe(true);
  });

  it('should reject when another episode creation agent job is already running', async () => {
    const prisma = createPrismaMock({ runningConflict: true });
    await expect(
      runEpisodeCreationAgent({
        prisma: prisma as never,
        teamId: 't1',
        projectId: 'p1',
        episodeId: 'e1',
        aiProfileId: 'a1',
        apiKeySecret: 'secret',
        currentJobId: 'job_current',
        updateProgress: async () => {},
      }),
    ).rejects.toThrow(/already running/i);

    expect(generateEpisodeCoreExpression).not.toHaveBeenCalled();
    expect(generateSceneScript).not.toHaveBeenCalled();
  });
});
