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
  const jobRows = new Map<string, ReturnType<typeof createJobRow>>();
  function getOrCreateJobRow(id: string, type = 'run_episode_creation_agent') {
    if (!jobRows.has(id)) {
      const base = createJobRow(type);
      jobRows.set(id, { ...base, id, type });
    }
    return jobRows.get(id)!;
  }

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
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: { type: string } }) => createJobRow(data.type)),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...getOrCreateJobRow(where.id), ...data } as ReturnType<typeof createJobRow>;
        jobRows.set(where.id, row);
        return row;
      }),
    },
  };
  const queue = {
    add: vi.fn().mockResolvedValue({}),
    getJob: vi.fn().mockResolvedValue(null),
    remove: vi.fn(),
  };
  const queueEvents = {};

  beforeEach(() => {
    vi.clearAllMocks();
    jobRows.clear();
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

  it('enqueuePlanEpisodes should accept targetEpisodeCount=100', async () => {
    (prisma.project.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({
        id: 'p1',
        summary: 'x'.repeat(120),
        style: 'anime',
        artStyleConfig: null,
      });
    await service.enqueuePlanEpisodes('t1', 'p1', 'a1', { targetEpisodeCount: 100 });
    expect(queue.add).toHaveBeenCalledWith(
      'plan_episodes',
      expect.objectContaining({
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
        options: { targetEpisodeCount: 100 },
      }),
      expect.any(Object),
    );
  });

  it('enqueuePlanEpisodes should reject when targetEpisodeCount > 100', async () => {
    (prisma.project.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({
        id: 'p1',
        summary: 'x'.repeat(120),
        style: 'anime',
        artStyleConfig: null,
      });
    await expect(
      service.enqueuePlanEpisodes('t1', 'p1', 'a1', { targetEpisodeCount: 101 }),
    ).rejects.toThrow(/out of range/i);
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

  it('enqueueRunEpisodeCreationAgent should add run_episode_creation_agent job', async () => {
    await service.enqueueRunEpisodeCreationAgent('t1', 'p1', 'e1', 'a1');
    expect(queue.add).toHaveBeenCalledWith(
      'run_episode_creation_agent',
      expect.objectContaining({
        teamId: 't1',
        projectId: 'p1',
        episodeId: 'e1',
        aiProfileId: 'a1',
      }),
      expect.any(Object),
    );
  });

  it('enqueueRunEpisodeCreationAgent should reject when another episode agent job is active', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'job_existing',
      status: 'running',
      type: 'run_episode_creation_agent',
      startedAt: new Date('2026-02-11T12:00:00.000Z'),
    });

    await expect(
      service.enqueueRunEpisodeCreationAgent('t1', 'p1', 'e1', 'a1'),
    ).rejects.toThrow(/already running/i);
    expect(queue.add).not.toHaveBeenCalledWith(
      'run_episode_creation_agent',
      expect.anything(),
      expect.anything(),
    );
  });

  it('enqueueRunEpisodeCreationAgent should include scene child task in conflict guard', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'job_scene_child',
      status: 'running',
      type: 'run_episode_creation_scene_task',
      startedAt: new Date('2026-02-11T12:00:00.000Z'),
    });

    await expect(
      service.enqueueRunEpisodeCreationAgent('t1', 'p1', 'e1', 'a1'),
    ).rejects.toThrow(/already running/i);
    expect(prisma.aIJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: {
            in: expect.arrayContaining(['run_episode_creation_scene_task']),
          },
        }),
      }),
    );
  });

  it('enqueueRunEpisodeCreationAgent should auto-release stale running lock and enqueue new job', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'job_stale',
        status: 'running',
        type: 'run_episode_creation_agent',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    (queue.getJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await service.enqueueRunEpisodeCreationAgent('t1', 'p1', 'e1', 'a1');

    expect(prisma.aIJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_stale' },
        data: expect.objectContaining({
          status: 'cancelled',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'run_episode_creation_agent',
      expect.objectContaining({
        teamId: 't1',
        projectId: 'p1',
        episodeId: 'e1',
        aiProfileId: 'a1',
      }),
      expect.any(Object),
    );
  });

  it('cancel should cascade all queued/running episode creation continuation jobs', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ...getOrCreateJobRow('job_root', 'run_episode_creation_agent'),
        status: 'running',
      })
      .mockResolvedValueOnce({
        ...getOrCreateJobRow('job_root', 'run_episode_creation_agent'),
        status: 'cancelled',
        finishedAt: new Date('2026-02-11T14:20:00.000Z'),
      });
    (prisma.aIJob.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'job_child_1' },
      { id: 'job_child_2' },
    ]);

    await service.cancel('t1', 'job_root');

    expect(prisma.aIJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          episodeId: 'e1',
          type: {
            in: ['run_episode_creation_agent', 'run_episode_creation_scene_task'],
          },
          status: { in: ['queued', 'running'] },
        }),
      }),
    );
    expect(queue.remove).toHaveBeenCalledWith('job_root');
    expect(queue.remove).toHaveBeenCalledWith('job_child_1');
    expect(queue.remove).toHaveBeenCalledWith('job_child_2');
    expect(prisma.aIJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['job_root', 'job_child_1', 'job_child_2'] } },
        data: expect.objectContaining({
          status: 'cancelled',
        }),
      }),
    );
  });

  it('enqueueRunWorkflowSupervisor should reject when another supervisor job is active', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'job_existing',
      status: 'running',
    });

    await expect(
      service.enqueueRunWorkflowSupervisor('t1', 'p1', 'a1'),
    ).rejects.toThrow(/already running/i);
    expect(queue.add).not.toHaveBeenCalledWith(
      'run_workflow_supervisor',
      expect.anything(),
      expect.anything(),
    );
  });

  it('enqueueRunWorkflowSupervisor should reject when project has other active workflow mutating jobs', async () => {
    (prisma.aIJob.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'job_chain_1',
      status: 'running',
      type: 'build_narrative_causal_chain',
    });

    await expect(
      service.enqueueRunWorkflowSupervisor('t1', 'p1', 'a1'),
    ).rejects.toThrow(/already running/i);
    expect(prisma.aIJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: {
            in: expect.arrayContaining([
              'run_workflow_supervisor',
              'expand_story_characters',
              'build_narrative_causal_chain',
              'generate_character_relationships',
              'generate_emotion_arc',
            ]),
          },
        }),
      }),
    );
    expect(queue.add).not.toHaveBeenCalledWith(
      'run_workflow_supervisor',
      expect.anything(),
      expect.anything(),
    );
  });
});
