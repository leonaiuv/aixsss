import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterRelationshipRecord } from '@/types';

vi.mock('@/lib/runtime/mode', () => ({ isApiMode: () => true }));

vi.mock('@/lib/api/characterRelationships', () => ({
  apiListCharacterRelationships: vi.fn(),
  apiCreateCharacterRelationship: vi.fn(),
  apiUpdateCharacterRelationship: vi.fn(),
  apiDeleteCharacterRelationship: vi.fn(),
}));

vi.mock('@/lib/api/workflow', () => ({
  apiWorkflowGenerateCharacterRelationships: vi.fn(),
}));

vi.mock('@/lib/api/aiJobs', () => ({
  apiWaitForAIJob: vi.fn(),
}));

import { useCharacterRelationshipStore } from './characterRelationshipStore';
import {
  apiListCharacterRelationships,
  apiCreateCharacterRelationship,
  apiUpdateCharacterRelationship,
  apiDeleteCharacterRelationship,
} from '@/lib/api/characterRelationships';
import { apiWorkflowGenerateCharacterRelationships } from '@/lib/api/workflow';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';

describe('characterRelationshipStore (api)', () => {
  const relationship: CharacterRelationshipRecord = {
    id: 'rel_1',
    projectId: 'proj_1',
    fromCharacterId: 'char_a',
    toCharacterId: 'char_b',
    type: 'mentor',
    label: '导师',
    description: '长期指导关系',
    intensity: 8,
    arc: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    useCharacterRelationshipStore.setState({
      relationships: [],
      isLoading: false,
      isGenerating: false,
      lastJobId: null,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('loadRelationships 应加载关系数据', async () => {
    vi.mocked(apiListCharacterRelationships).mockResolvedValue([relationship]);

    await useCharacterRelationshipStore.getState().loadRelationships('proj_1');

    expect(apiListCharacterRelationships).toHaveBeenCalledWith('proj_1');
    expect(useCharacterRelationshipStore.getState().relationships).toEqual([relationship]);
  });

  it('createRelationship/updateRelationship/deleteRelationship 应维护本地状态', async () => {
    vi.mocked(apiCreateCharacterRelationship).mockResolvedValue(relationship);
    vi.mocked(apiUpdateCharacterRelationship).mockResolvedValue({
      ...relationship,
      type: 'rival',
      label: '竞争',
    });
    vi.mocked(apiDeleteCharacterRelationship).mockResolvedValue({ ok: true });

    await useCharacterRelationshipStore.getState().createRelationship('proj_1', {
      fromCharacterId: 'char_a',
      toCharacterId: 'char_b',
      type: 'mentor',
    });
    expect(useCharacterRelationshipStore.getState().relationships).toHaveLength(1);

    await useCharacterRelationshipStore
      .getState()
      .updateRelationship('proj_1', 'rel_1', { type: 'rival', label: '竞争' });
    expect(useCharacterRelationshipStore.getState().relationships[0].type).toBe('rival');

    await useCharacterRelationshipStore.getState().deleteRelationship('proj_1', 'rel_1');
    expect(useCharacterRelationshipStore.getState().relationships).toHaveLength(0);
  });

  it('generateRelationships 应入队并在完成后刷新列表', async () => {
    vi.mocked(apiWorkflowGenerateCharacterRelationships).mockResolvedValue({
      id: 'job_rel_1',
      type: 'generate_character_relationships',
      status: 'queued',
      error: null,
      result: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    } as Awaited<ReturnType<typeof apiWorkflowGenerateCharacterRelationships>>);

    vi.mocked(apiWaitForAIJob).mockResolvedValue({
      id: 'job_rel_1',
      status: 'succeeded',
      result: null,
      progress: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: '2026-01-01T00:00:03.000Z',
      type: 'generate_character_relationships',
      error: null,
      teamId: 'team_1',
      projectId: 'proj_1',
      sceneId: null,
      episodeId: null,
      aiProfileId: 'aip_1',
      cancelRequested: false,
    } as Awaited<ReturnType<typeof apiWaitForAIJob>>);

    vi.mocked(apiListCharacterRelationships).mockResolvedValue([relationship]);

    await useCharacterRelationshipStore.getState().generateRelationships({
      projectId: 'proj_1',
      aiProfileId: 'aip_1',
    });

    expect(apiWorkflowGenerateCharacterRelationships).toHaveBeenCalledWith({
      projectId: 'proj_1',
      aiProfileId: 'aip_1',
    });
    expect(apiWaitForAIJob).toHaveBeenCalledWith('job_rel_1', expect.any(Object));
    expect(useCharacterRelationshipStore.getState().relationships).toEqual([relationship]);
  });
});
