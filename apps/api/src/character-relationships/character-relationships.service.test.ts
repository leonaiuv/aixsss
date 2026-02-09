import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterRelationshipsService } from './character-relationships.service.js';

function relationshipRow() {
  return {
    id: 'rel_1',
    projectId: 'p1',
    fromCharacterId: 'c1',
    toCharacterId: 'c2',
    type: 'friendship',
    label: '朋友',
    description: '一起长大',
    intensity: 8,
    arc: [],
    createdAt: new Date('2026-02-09T00:00:00.000Z'),
    updatedAt: new Date('2026-02-09T00:00:00.000Z'),
  };
}

describe('CharacterRelationshipsService', () => {
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'p1' }),
    },
    character: {
      findMany: vi.fn().mockImplementation(async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        if (!ids) return [{ id: 'c1' }, { id: 'c2' }];
        return ids.map((id) => ({ id }));
      }),
      update: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
    characterRelationship: {
      findMany: vi.fn().mockResolvedValue([
        {
          fromCharacterId: 'c1',
          toCharacterId: 'c2',
          type: 'friendship',
          description: '一起长大',
        },
      ]),
      upsert: vi.fn().mockResolvedValue(relationshipRow()),
      update: vi.fn().mockResolvedValue(relationshipRow()),
      findFirst: vi.fn().mockResolvedValue(relationshipRow()),
      delete: vi.fn().mockResolvedValue({ id: 'rel_1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  let service: CharacterRelationshipsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CharacterRelationshipsService(prisma as never);
  });

  it('create should write relation table and sync legacy json', async () => {
    await service.create('t1', 'p1', {
      fromCharacterId: 'c1',
      toCharacterId: 'c2',
      type: 'friendship',
      label: '朋友',
      description: '一起长大',
      intensity: 8,
      arc: [],
    });

    expect(prisma.characterRelationship.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.character.update).toHaveBeenCalledTimes(2);
  });

  it('upsertFromLegacyInput should upsert current edges and remove deleted ones', async () => {
    await service.upsertFromLegacyInput('t1', 'p1', 'c1', [
      {
        targetCharacterId: 'c2',
        relationshipType: 'friendship',
        description: '关系描述',
      },
    ]);

    expect(prisma.characterRelationship.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.characterRelationship.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.character.update).toHaveBeenCalledTimes(1);
  });
});
