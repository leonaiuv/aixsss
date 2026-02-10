import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service.js';

function createJobRow(type: string) {
  return {
    id: `job_${type}`,
    teamId: 't1',
    projectId: 'p1',
    episodeId: 'e1',
    sceneId: 's1',
    aiProfileId: 'a1',
    type,
    status: 'queued',
    attempts: 0,
    error: null,
    result: null,
    createdAt: new Date('2026-02-09T00:00:00.000Z'),
    startedAt: null,
    finishedAt: null,
  };
}

describe('JobsService new workflow enqueue', () => {
  let service: JobsService;
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
    },
    scene: {
      findFirst: vi.fn().mockResolvedValue({ id: 's1' }),
      update: vi.fn().mockResolvedValue({ id: 's1' }),
    },
    episode: {
      findFirst: vi.fn().mockResolvedValue({ id: 'e1', coreExpression: { theme: 't' } }),
    },
    aIProfile: {
      findFirst: vi.fn().mockResolvedValue({ id: 'a1' }),
    },
    aIJob: {
      create: vi.fn().mockImplementation(async ({ data }: { data: { type: string } }) => createJobRow(data.type)),
    },
  };
  const queue = {
    add: vi.fn().mockResolvedValue({}),
    getJob: vi.fn(),
    remove: vi.fn(),
  };
  const queueEvents = {};

  beforeEach(() => {
    vi.clearAllMocks();
    service = new JobsService(prisma as never, queue as never, queueEvents as never);
  });

  it('enqueueGenerateSceneScript should add generate_scene_script job', async () => {
    await service.enqueueGenerateSceneScript('t1', 'p1', 'e1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'generate_scene_script',
      expect.objectContaining({ teamId: 't1', projectId: 'p1', episodeId: 'e1', aiProfileId: 'a1' }),
      expect.any(Object),
    );
  });

  it('enqueueGenerateEmotionArc should add generate_emotion_arc job', async () => {
    await service.enqueueGenerateEmotionArc('t1', 'p1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'generate_emotion_arc',
      expect.objectContaining({ teamId: 't1', projectId: 'p1', aiProfileId: 'a1' }),
      expect.any(Object),
    );
  });

  it('enqueueGenerateSoundDesign should add generate_sound_design job', async () => {
    await service.enqueueGenerateSoundDesign('t1', 'p1', 's1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'generate_sound_design',
      expect.objectContaining({ teamId: 't1', projectId: 'p1', sceneId: 's1', aiProfileId: 'a1' }),
      expect.any(Object),
    );
  });

  it('enqueueGenerateCharacterRelationships should add generate_character_relationships job', async () => {
    await service.enqueueGenerateCharacterRelationships('t1', 'p1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'generate_character_relationships',
      expect.objectContaining({ teamId: 't1', projectId: 'p1', aiProfileId: 'a1' }),
      expect.any(Object),
    );
  });

  it('enqueueEstimateDuration should add estimate_duration job', async () => {
    await service.enqueueEstimateDuration('t1', 'p1', 's1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'estimate_duration',
      expect.objectContaining({ teamId: 't1', projectId: 'p1', sceneId: 's1', aiProfileId: 'a1' }),
      expect.any(Object),
    );
  });

  it('enqueueExpandStoryCharacters should add expand_story_characters job', async () => {
    await service.enqueueExpandStoryCharacters('t1', 'p1', 'a1', { maxNewCharacters: 9 });
    expect(queue.add).toHaveBeenCalledWith(
      'expand_story_characters',
      expect.objectContaining({
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
        maxNewCharacters: 9,
      }),
      expect.any(Object),
    );
  });

  it('enqueueRunWorkflowSupervisor should add run_workflow_supervisor job', async () => {
    await service.enqueueRunWorkflowSupervisor('t1', 'p1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'run_workflow_supervisor',
      expect.objectContaining({
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
      }),
      expect.any(Object),
    );
  });
});
