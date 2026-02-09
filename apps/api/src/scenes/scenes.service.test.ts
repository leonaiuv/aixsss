import { describe, expect, it, vi } from 'vitest';
import { ScenesService } from './scenes.service.js';

function sceneRow() {
  return {
    id: 's1',
    projectId: 'p1',
    episodeId: 'e1',
    order: 1,
    summary: 'summary',
    sceneDescription: '',
    actionDescription: '',
    castCharacterIds: [],
    shotPrompt: '',
    motionPrompt: '',
    actionPlanJson: null,
    keyframeGroupsJson: null,
    motionGroupsJson: null,
    storyboardSceneBibleJson: null,
    storyboardPlanJson: null,
    storyboardGroupsJson: null,
    sceneScriptJson: null,
    soundDesignJson: null,
    transitionInJson: null,
    transitionOutJson: null,
    shotLanguageJson: null,
    durationEstimateJson: null,
    generatedImages: null,
    generatedVideos: null,
    dialogues: null,
    contextSummary: null,
    status: 'pending',
    notes: '',
    createdAt: new Date('2026-02-09T00:00:00.000Z'),
    updatedAt: new Date('2026-02-09T00:00:00.000Z'),
  };
}

describe('ScenesService', () => {
  it('update should passthrough professional workflow json fields', async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
      },
      scene: {
        findFirst: vi.fn().mockResolvedValue({ id: 's1' }),
        update: vi.fn().mockResolvedValue(sceneRow()),
      },
    };

    const service = new ScenesService(prisma as never);
    await service.update('t1', 'p1', 's1', {
      sceneScriptJson: { a: 1 },
      soundDesignJson: { b: 1 },
      transitionInJson: { c: 1 },
      transitionOutJson: { d: 1 },
      shotLanguageJson: { e: 1 },
      durationEstimateJson: { f: 1 },
    });

    expect(prisma.scene.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({
          sceneScriptJson: { a: 1 },
          soundDesignJson: { b: 1 },
          transitionInJson: { c: 1 },
          transitionOutJson: { d: 1 },
          shotLanguageJson: { e: 1 },
          durationEstimateJson: { f: 1 },
        }),
      }),
    );
  });
});

