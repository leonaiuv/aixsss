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

vi.mock('@aixsss/shared', async () => {
  const { z } = await import('zod');
  const EpisodePlanEpisodeSchema = z.object({
    order: z.number().int().min(1).max(100),
    title: z.string().min(1).max(200),
    logline: z.string().min(1).max(2000),
    mainCharacters: z.array(z.string().min(1).max(200)).default([]),
    beats: z.array(z.string().min(1).max(500)).default([]),
    sceneScope: z.string().min(1).max(2000),
    cliffhanger: z.string().min(0).max(2000).optional().nullable(),
  });
  const EpisodePlanSchema = z
    .object({
      episodeCount: z.number().int().min(1).max(100),
      reasoningBrief: z.string().optional().nullable(),
      episodes: z.array(EpisodePlanEpisodeSchema).min(1).max(100),
    })
    .superRefine((val, ctx) => {
      if (val.episodeCount !== val.episodes.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['episodeCount'],
          message: 'episodeCount must equal episodes.length',
        });
      }
    });
  return { EpisodePlanSchema };
});

import { chatWithProvider } from '../providers/index.js';
import { planEpisodes } from './planEpisodes.js';

function makeChunk(startOrder: number, count: number) {
  return {
    batchStartOrder: startOrder,
    batchCount: count,
    reasoningBrief: startOrder === 1 ? '长篇叙事需要多集推进' : null,
    episodes: Array.from({ length: count }, (_, idx) => {
      const order = startOrder + idx;
      return {
        order,
        title: `第${order}集`,
        logline: `第${order}集推进`,
        mainCharacters: ['主角'],
        beats: ['铺垫', '冲突', '转折', '钩子'],
        sceneScope: `主要场景${order}`,
        cliffhanger: `钩子${order}`,
      };
    }),
  };
}

describe('planEpisodes chunk loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate 60 episodes in batches and persist all orders', async () => {
    type TaskArgs = Parameters<typeof planEpisodes>[0];

    let call = 0;
    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const start = call * 10 + 1;
      call += 1;
      return {
        content: JSON.stringify(makeChunk(start, 10)),
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      };
    });

    const tx = {
      episode: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      project: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '一个长篇故事',
          style: 'anime',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: { completedPhase: 4 } },
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
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      systemPrompt: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (fn: unknown) => {
        if (typeof fn === 'function') return fn(tx);
        return null;
      }),
    };

    const result = await planEpisodes({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      options: { targetEpisodeCount: 60 },
      updateProgress: async () => {},
    });

    expect(call).toBe(6);
    expect(result.episodeCount).toBe(60);
    expect(result.episodes).toHaveLength(60);
    expect((tx.episode.upsert as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(60);
    expect((tx.episode.deleteMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      where: { projectId: 'p1', order: { gt: 60 } },
    });
  });
});
