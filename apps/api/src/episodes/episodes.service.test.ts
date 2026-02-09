import { describe, expect, it, vi } from 'vitest';
import { EpisodesService } from './episodes.service.js';

function episodeRow() {
  return {
    id: 'e1',
    projectId: 'p1',
    order: 1,
    title: '第1集',
    summary: '概要',
    outline: null,
    coreExpression: null,
    sceneScriptDraft: '',
    emotionArcJson: null,
    durationEstimateJson: null,
    contextCache: null,
    workflowState: 'IDLE',
    createdAt: new Date('2026-02-09T00:00:00.000Z'),
    updatedAt: new Date('2026-02-09T00:00:00.000Z'),
  };
}

describe('EpisodesService', () => {
  it('create should persist script draft/emotion arc/duration estimate fields', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      episode: {
        create: vi.fn().mockResolvedValue(episodeRow()),
      },
    };
    const service = new EpisodesService(prisma as never);

    await service.create('t1', 'p1', {
      order: 1,
      title: '第1集',
      summary: '概要',
      sceneScriptDraft: '脚本草稿',
      emotionArcJson: { points: [] },
      durationEstimateJson: { totalSec: 12 },
    });

    expect(prisma.episode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sceneScriptDraft: '脚本草稿',
          emotionArcJson: { points: [] },
          durationEstimateJson: { totalSec: 12 },
        }),
      }),
    );
  });

  it('update should passthrough new episode workflow fields', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({ id: 'e1' }),
        update: vi.fn().mockResolvedValue(episodeRow()),
      },
    };
    const service = new EpisodesService(prisma as never);

    await service.update('t1', 'p1', 'e1', {
      sceneScriptDraft: 'draft-v2',
      emotionArcJson: { points: [{ episodeOrder: 1, tension: 5, emotionalValence: 1 }] },
      durationEstimateJson: { totalSec: 33 },
    });

    expect(prisma.episode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1' },
        data: expect.objectContaining({
          sceneScriptDraft: 'draft-v2',
          emotionArcJson: { points: [{ episodeOrder: 1, tension: 5, emotionalValence: 1 }] },
          durationEstimateJson: { totalSec: 33 },
        }),
      }),
    );
  });
});

