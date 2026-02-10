import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

vi.mock('./systemPrompts.js', () => ({
  loadSystemPrompt: vi.fn().mockResolvedValue('system prompt'),
}));

vi.mock('../agents/runtime/featureFlags.js', () => ({
  isAgentNarrativePhase34Enabled: () => true,
  isAgentFallbackToLegacyEnabled: () => true,
  getAgentMaxSteps: () => 4,
  getAgentStepTimeoutMs: () => 30_000,
  getAgentTotalTimeoutMs: () => 120_000,
}));

vi.mock('../agents/runtime/jsonToolLoop.js', () => ({
  runJsonToolLoop: vi.fn(),
}));

import { chatWithProvider } from '../providers/index.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import { buildNarrativeCausalChain } from './buildNarrativeCausalChain.js';

const phase4Result = {
  plotLines: [
    {
      lineType: 'main',
      driver: '主角',
      statedGoal: '表面目标A',
      trueGoal: '真实目标A',
      keyInterlocks: ['与支线冲突'],
      pointOfNoReturn: '触发不可逆事件',
    },
    {
      lineType: 'sub1',
      driver: '配角',
      statedGoal: '表面目标B',
      trueGoal: '真实目标B',
      keyInterlocks: ['反噬主线'],
      pointOfNoReturn: '背叛公开化',
    },
  ],
  consistencyChecks: {
    blindSpotDrivesAction: true,
    infoFlowChangesAtLeastTwo: true,
    coreConflictHasThreeWayTension: true,
    endingIrreversibleTriggeredByMultiLines: true,
    noRedundantRole: true,
    notes: [],
  },
};

const existingChain = {
  version: '2.0.0',
  validationStatus: 'incomplete',
  revisionSuggestions: [],
  completedPhase: 3,
  outlineSummary: '故事概要',
  conflictEngine: {
    coreObjectOrEvent: '账册',
    stakesByFaction: {},
    necessityDerivation: [],
  },
  infoVisibilityLayers: [],
  characterMatrix: [],
  beatFlow: {
    actMode: 'three_act',
    acts: [
      {
        act: 1,
        actName: '开端',
        beats: [
          {
            beatName: '引子',
            surfaceEvent: '事件',
            infoFlow: '信息',
            escalation: 3,
            interlock: '咬合',
            location: '城门',
            characters: ['主角'],
            visualHook: '风起旗动',
            emotionalTone: '紧张',
            estimatedScenes: 2,
          },
          {
            beatName: '冲突',
            surfaceEvent: '事件',
            infoFlow: '信息',
            escalation: 5,
            interlock: '咬合',
            location: '街巷',
            characters: ['主角'],
            visualHook: '雨夜追逐',
            emotionalTone: '压迫',
            estimatedScenes: 2,
          },
          {
            beatName: '决断',
            surfaceEvent: '事件',
            infoFlow: '信息',
            escalation: 7,
            interlock: '咬合',
            location: '码头',
            characters: ['主角'],
            visualHook: '火光映脸',
            emotionalTone: '决绝',
            estimatedScenes: 2,
          },
        ],
      },
      {
        act: 2,
        actName: '发展',
        beats: [],
      },
      {
        act: 3,
        actName: '高潮',
        beats: [],
      },
    ],
  },
  plotLines: [],
  consistencyChecks: null,
};

function createPrismaMock() {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'p1',
        summary: '故事梗概',
        style: '写实',
        artStyleConfig: null,
        contextCache: { narrativeCausalChain: existingChain },
      }),
      update: vi.fn().mockResolvedValue({ id: 'p1' }),
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
    worldViewElement: { findMany: vi.fn().mockResolvedValue([]) },
    character: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('buildNarrativeCausalChain phase3/4 agent mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('phase4 should return agent execution metadata when agent path succeeds', async () => {
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
            kind: 'tool_call',
            startedAt: '2026-02-10T00:00:00.000Z',
            finishedAt: '2026-02-10T00:00:00.500Z',
            durationMs: 500,
            toolCall: { name: 'read_phase_context', status: 'ok' },
          },
          {
            index: 2,
            kind: 'final',
            startedAt: '2026-02-10T00:00:00.500Z',
            finishedAt: '2026-02-10T00:00:01.000Z',
            durationMs: 500,
          },
        ],
      },
    });

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(phase4Result),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = createPrismaMock();
    const res = await buildNarrativeCausalChain({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      phase: 4,
      updateProgress: async () => {},
    });

    expect(runJsonToolLoop).toHaveBeenCalledTimes(1);
    expect(res.executionMode).toBe('agent');
    expect(res.fallbackUsed).toBe(false);
    expect(res.agentTrace).toBeTruthy();
    expect(Array.isArray(res.stepSummaries)).toBe(true);
    expect(res.stepSummaries.length).toBeGreaterThan(0);
  });

  it('phase4 should mark fallback metadata when agent loop falls back to legacy', async () => {
    (runJsonToolLoop as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      final: { proceed: true },
      executionMode: 'legacy',
      fallbackUsed: true,
      trace: {
        version: 1,
        executionMode: 'legacy',
        fallbackUsed: true,
        fallbackReason: 'agent_failed_use_legacy',
        startedAt: '2026-02-10T00:00:00.000Z',
        finishedAt: '2026-02-10T00:00:01.000Z',
        totalDurationMs: 1000,
        steps: [
          {
            index: 1,
            kind: 'fallback',
            startedAt: '2026-02-10T00:00:00.000Z',
            finishedAt: '2026-02-10T00:00:01.000Z',
            durationMs: 1000,
          },
        ],
      },
    });

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify(phase4Result),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = createPrismaMock();
    const res = await buildNarrativeCausalChain({
      prisma: prisma as never,
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      phase: 4,
      updateProgress: async () => {},
    });

    expect(res.executionMode).toBe('legacy');
    expect(res.fallbackUsed).toBe(true);
    expect(res.agentTrace).toBeTruthy();
    expect(res.stepSummaries.length).toBe(1);
  });
});
