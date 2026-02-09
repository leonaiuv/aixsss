import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateSceneScript } from './generateSceneScript.js';

describe('generateSceneScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate episode scene script and persist draft/state', async () => {
    type TaskArgs = Parameters<typeof generateSceneScript>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        title: '第1集',
        draft: 'INT. ROOM - DAY\n角色进入房间。',
        scenes: [{ order: 1, sceneHeading: 'INT. ROOM - DAY', summary: '角色进入房间' }],
        generatedAt: '2026-02-09T00:00:00.000Z',
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
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'e1',
          order: 1,
          title: '第1集',
          summary: '本集概要',
          outline: { beats: [] },
          coreExpression: { theme: '成长' },
        }),
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
      },
      scene: {
        findMany: vi.fn().mockResolvedValue([{ order: 1, summary: '旧分镜1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

    const result = await generateSceneScript({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.episodeId).toBe('e1');
    expect(result.sceneCount).toBe(1);
    expect((prisma.episode.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      where: { id: 'e1' },
      data: expect.objectContaining({
        sceneScriptDraft: expect.stringContaining('INT. ROOM - DAY'),
        workflowState: 'SCRIPT_WRITING',
      }),
    });
  });

  it('should fallback with fix prompt when first output is invalid json', async () => {
    type TaskArgs = Parameters<typeof generateSceneScript>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: 'not-json',
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: '第1集',
          draft: 'EXT. STREET - NIGHT\n追逐开始。',
          scenes: [{ order: 1, sceneHeading: 'EXT. STREET - NIGHT', summary: '追逐开始' }],
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
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'e1',
          order: 1,
          title: '第1集',
          summary: '本集概要',
          outline: null,
          coreExpression: { theme: '成长' },
        }),
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
      },
      scene: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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

    const result = await generateSceneScript({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.sceneCount).toBe(1);
    expect((chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});
