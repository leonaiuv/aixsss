import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateSoundDesign } from './generateSoundDesign.js';

describe('generateSoundDesign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate scene sound design and save to scene json', async () => {
    type TaskArgs = Parameters<typeof generateSoundDesign>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        cues: [
          {
            id: 'cue_1',
            type: 'sfx',
            description: '门轴轻响',
            timingHint: '开门瞬间',
            intensity: 'subtle',
          },
        ],
        masterMood: '压抑',
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          style: 'anime',
          artStyleConfig: null,
          protagonist: '主角',
        }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          summary: '分镜概要',
          sceneDescription: '{"scene":{"zh":"室内"}}',
          shotPrompt: '{"keyframes":{}}',
          motionPrompt: '{"motion":{}}',
          dialogues: [{ type: 'dialogue', content: '你好', order: 1 }],
          soundDesignJson: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
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

    const result = await generateSoundDesign({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.sceneId).toBe('s1');
    expect(result.cueCount).toBe(1);
    const updateCalls = (prisma.scene.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls.at(-1)?.[0]).toMatchObject({
      where: { id: 's1' },
      data: expect.objectContaining({
        status: 'sound_design_confirmed',
      }),
    });
  });

  it('should fallback with fix prompt when first output is invalid', async () => {
    type TaskArgs = Parameters<typeof generateSoundDesign>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: 'bad-output',
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          cues: [
            {
              id: 'cue_1',
              type: 'bgm',
              description: '低频持续音',
              intensity: 'normal',
            },
          ],
        }),
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          style: 'anime',
          artStyleConfig: null,
          protagonist: '主角',
        }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          summary: '分镜概要',
          sceneDescription: '{}',
          shotPrompt: '{}',
          motionPrompt: '{}',
          dialogues: [],
          soundDesignJson: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
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

    const result = await generateSoundDesign({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.cueCount).toBe(1);
    expect((chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});
