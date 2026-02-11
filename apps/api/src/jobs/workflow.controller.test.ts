import { describe, expect, it, vi } from 'vitest';
import { WorkflowController } from './workflow.controller.js';

describe('WorkflowController new routes', () => {
  const jobs = {
    enqueuePlanEpisodes: vi.fn().mockResolvedValue({ id: 'job0' }),
    enqueueGenerateSceneScript: vi.fn().mockResolvedValue({ id: 'job1' }),
    enqueueGenerateEmotionArc: vi.fn().mockResolvedValue({ id: 'job2' }),
    enqueueGenerateSoundDesign: vi.fn().mockResolvedValue({ id: 'job3' }),
    enqueueGenerateCharacterRelationships: vi.fn().mockResolvedValue({ id: 'job4' }),
    enqueueEstimateDuration: vi.fn().mockResolvedValue({ id: 'job5' }),
    enqueueExpandStoryCharacters: vi.fn().mockResolvedValue({ id: 'job6' }),
    enqueueRunWorkflowSupervisor: vi.fn().mockResolvedValue({ id: 'job7' }),
  };
  const controller = new WorkflowController(jobs as never);
  const user = { teamId: 't1' } as { teamId: string };

  it('planEpisodes should validate targetEpisodeCount up to 100 and enqueue', async () => {
    await controller.planEpisodes(user as never, 'p1', { aiProfileId: 'a1', targetEpisodeCount: 100 });
    expect(jobs.enqueuePlanEpisodes).toHaveBeenCalledWith('t1', 'p1', 'a1', {
      targetEpisodeCount: 100,
    });

    expect(() =>
      controller.planEpisodes(user as never, 'p1', { aiProfileId: 'a1', targetEpisodeCount: 101 }),
    ).toThrow();
  });

  it('generateEpisodeSceneScript should validate body and enqueue', async () => {
    await controller.generateEpisodeSceneScript(user as never, 'p1', 'e1', { aiProfileId: 'a1' });
    expect(jobs.enqueueGenerateSceneScript).toHaveBeenCalledWith('t1', 'p1', 'e1', 'a1');
    expect(() => controller.generateEpisodeSceneScript(user as never, 'p1', 'e1', {})).toThrow();
  });

  it('generateEmotionArc should enqueue with project scope', async () => {
    await controller.generateEmotionArc(user as never, 'p1', { aiProfileId: 'a1' });
    expect(jobs.enqueueGenerateEmotionArc).toHaveBeenCalledWith('t1', 'p1', 'a1');
  });

  it('generateSoundDesign should enqueue scene scoped job', async () => {
    await controller.generateSoundDesign(user as never, 'p1', 's1', { aiProfileId: 'a1' });
    expect(jobs.enqueueGenerateSoundDesign).toHaveBeenCalledWith('t1', 'p1', 's1', 'a1');
  });

  it('generateCharacterRelationships should enqueue project scoped job', async () => {
    await controller.generateCharacterRelationships(user as never, 'p1', { aiProfileId: 'a1' });
    expect(jobs.enqueueGenerateCharacterRelationships).toHaveBeenCalledWith('t1', 'p1', 'a1');
  });

  it('estimateDuration should enqueue scene scoped job', async () => {
    await controller.estimateDuration(user as never, 'p1', 's1', { aiProfileId: 'a1' });
    expect(jobs.enqueueEstimateDuration).toHaveBeenCalledWith('t1', 'p1', 's1', 'a1');
  });

  it('expandStoryCharacters should validate maxNewCharacters and enqueue', async () => {
    await controller.expandStoryCharacters(user as never, 'p1', {
      aiProfileId: 'a1',
      maxNewCharacters: 6,
    });
    expect(jobs.enqueueExpandStoryCharacters).toHaveBeenCalledWith('t1', 'p1', 'a1', {
      maxNewCharacters: 6,
    });

    expect(() =>
      controller.expandStoryCharacters(user as never, 'p1', {
        aiProfileId: 'a1',
        maxNewCharacters: 0,
      }),
    ).toThrow();
  });

  it('runWorkflowSupervisor should enqueue project scoped supervisor job', async () => {
    await controller.runWorkflowSupervisor(user as never, 'p1', { aiProfileId: 'a1' });
    expect(jobs.enqueueRunWorkflowSupervisor).toHaveBeenCalledWith('t1', 'p1', 'a1');
  });
});
