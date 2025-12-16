import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateEpisodeSceneList } from './generateEpisodeSceneList.js';

describe('generateEpisodeSceneList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respect sceneCountHint up to 24 (regression)', async () => {
    type TaskArgs = Parameters<typeof generateEpisodeSceneList>[0];

    const lines = Array.from({ length: 30 }, (_, i) => `${i + 1}. 分镜${i + 1}`);

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: lines.join('\n'),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '风格',
          artStyleConfig: null,
          contextCache: {},
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'e1',
          order: 1,
          title: '第1集',
          summary: '概要',
          outline: null,
          coreExpression: { theme: '主题' },
        }),
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
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      scene: {
        deleteMany: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };

    const res = await generateEpisodeSceneList({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      options: { sceneCountHint: 24 },
      updateProgress: async () => {},
    });

    expect(res.sceneCount).toBe(24);
    const createManyMock = prisma.scene.createMany as unknown as ReturnType<typeof vi.fn>;
    const createManyArgs = createManyMock.mock.calls[0][0] as { data: unknown[] };
    expect(createManyArgs.data).toHaveLength(24);
  });
});


