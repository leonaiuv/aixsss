import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateEmotionArc } from './generateEmotionArc.js';

describe('generateEmotionArc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate emotion arc and persist to project + episodes', async () => {
    type TaskArgs = Parameters<typeof generateEmotionArc>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        points: [
          { episodeOrder: 1, tension: 4, emotionalValence: 1, label: '铺垫' },
          { episodeOrder: 2, tension: 8, emotionalValence: -2, label: '爆发' },
        ],
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: 'anime',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: { ok: true } },
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      episode: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'e1', order: 1, title: '第1集', summary: 's1', coreExpression: {} },
          { id: 'e2', order: 2, title: '第2集', summary: 's2', coreExpression: {} },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
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
    };

    const result = await generateEmotionArc({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.pointCount).toBe(2);
    expect((prisma.project.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      where: { id: 'p1' },
      data: expect.objectContaining({
        contextCache: expect.any(Object),
      }),
    });
    expect((prisma.episode.update as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

