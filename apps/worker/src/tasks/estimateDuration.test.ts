import { beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateDuration } from './estimateDuration.js';

describe('estimateDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should estimate scene duration and persist scene.durationEstimateJson', async () => {
    type TaskArgs = Parameters<typeof estimateDuration>[0];

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({
          id: 's1',
          episodeId: 'e1',
          order: 1,
          dialogues: [
            { type: 'dialogue', content: '你好。', order: 1 },
            { type: 'dialogue', content: '我们走。', order: 2 },
          ],
          motionPrompt: '{"motion":{"short":{"zh":"角色转身离开"}}}',
          transitionOutJson: { type: 'cut' },
          soundDesignJson: { cues: [{ id: 'c1', type: 'sfx', description: '门响' }] },
        }),
        findMany: vi.fn().mockResolvedValue([
          { order: 1, durationEstimateJson: { totalSec: 8, dialogueSec: 3, actionSec: 4, transitionSec: 0.5, pauseSec: 0.5, confidence: 'medium' } },
          { order: 2, durationEstimateJson: { totalSec: 10, dialogueSec: 5, actionSec: 4, transitionSec: 0.5, pauseSec: 0.5, confidence: 'medium' } },
        ]),
        update: vi.fn().mockResolvedValue({ id: 's1' }),
      },
      episode: {
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
      },
    };

    const result = await estimateDuration({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      sceneId: 's1',
      updateProgress: async () => {},
    });

    expect(result.sceneId).toBe('s1');
    expect(result.totalSec).toBeGreaterThan(0);
    expect((prisma.scene.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      where: { id: 's1' },
      data: expect.objectContaining({
        durationEstimateJson: expect.any(Object),
      }),
    });
  });
});

