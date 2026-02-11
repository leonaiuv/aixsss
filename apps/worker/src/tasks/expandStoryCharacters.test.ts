import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { expandStoryCharacters } from './expandStoryCharacters.js';

describe('expandStoryCharacters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate candidates and persist into project.contextCache', async () => {
    type TaskArgs = Parameters<typeof expandStoryCharacters>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        candidates: [
          {
            name: '林顾问',
            roleType: 'mentor',
            briefDescription: '情报中间人',
            appearance: '黑色大衣',
            personality: '冷静克制',
            background: '前安全顾问',
            confidence: 0.82,
            evidence: ['phase2.characterMatrix:林顾问', 'phase3.beats:交易场景'],
          },
          {
            name: '  林顾问 ',
            roleType: 'mentor',
            briefDescription: '重复角色',
            confidence: 0.7,
            evidence: ['重复'],
          },
          {
            name: '主角',
            roleType: 'lead',
            briefDescription: '与已有角色重名',
            confidence: 0.91,
            evidence: ['已有角色'],
          },
          {
            name: '周队长',
            roleType: 'ally',
            briefDescription: '行动负责人',
            appearance: '战术外套',
            personality: '果断',
            background: '突击队长',
            confidence: 0.68,
            evidence: ['phase3.beats:追捕', 'phase4.plotLines:主线驱动'],
          },
        ],
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '未来都市中少女寻找真相',
          protagonist: '主角',
          style: 'anime',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: { completedPhase: 3 } },
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', name: '主角', briefDescription: '主角' },
          { id: 'c2', name: '反派', briefDescription: '反派' },
        ]),
      },
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'w1', type: '规则', title: '监察系统', content: '全城监控' },
        ]),
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

    expect(result.candidateCount).toBe(2);
    expect(result.stats).toMatchObject({
      existingSkipped: 1,
      duplicatesResolved: 1,
    });
    const updateArg = (prisma.project.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .data.contextCache as Record<string, unknown>;
    const expansion = updateArg.characterExpansion as {
      candidates: Array<{ name: string }>;
    };
    expect(expansion.candidates.map((c) => c.name)).toEqual(['林顾问', '周队长']);
  });

  it('should filter low confidence candidates and respect maxNewCharacters', async () => {
    type TaskArgs = Parameters<typeof expandStoryCharacters>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        candidates: [
          { name: 'A', roleType: 'supporting', briefDescription: 'a', confidence: 0.2 },
          { name: 'B', roleType: 'supporting', briefDescription: 'b', confidence: 0.9 },
          { name: 'C', roleType: 'supporting', briefDescription: 'c', confidence: 0.88 },
        ],
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: 'summary',
          protagonist: 'p',
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
      maxNewCharacters: 1,
      updateProgress: async () => {},
    });

    expect(result.candidateCount).toBe(1);
    expect(result.stats.lowConfidenceSkipped).toBe(1);
    expect(result.stats.finalCount).toBe(1);
  });

  it('should merge with previous pending candidates instead of overwriting', async () => {
    type TaskArgs = Parameters<typeof expandStoryCharacters>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        candidates: [
          {
            name: '新角色A',
            roleType: 'supporting',
            briefDescription: '新增',
            confidence: 0.9,
            evidence: ['phase3'],
          },
          {
            name: '旧候选',
            roleType: 'supporting',
            briefDescription: '与历史候选重名',
            confidence: 0.88,
            evidence: ['phase4'],
          },
        ],
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: 'summary',
          protagonist: 'p',
          style: 'anime',
          artStyleConfig: null,
          contextCache: {
            narrativeCausalChain: { completedPhase: 3 },
            characterExpansion: {
              runId: 'run_prev',
              generatedAt: '2026-02-10T00:00:00.000Z',
              source: 'narrative_causal_chain',
              candidates: [
                {
                  tempId: 'cand_prev',
                  name: '旧候选',
                  aliases: [],
                  roleType: 'supporting',
                  briefDescription: '来自上一次',
                  appearance: '',
                  personality: '',
                  background: '',
                  confidence: 0.8,
                  evidence: ['prev'],
                },
              ],
            },
          },
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

    await expandStoryCharacters({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      maxNewCharacters: 8,
      updateProgress: async () => {},
    });

    const updateArg = (prisma.project.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .data.contextCache as Record<string, unknown>;
    const expansion = updateArg.characterExpansion as {
      candidates: Array<{ name: string }>;
    };
    expect(expansion.candidates.map((c) => c.name)).toEqual(['旧候选', '新角色A']);
  });
});
