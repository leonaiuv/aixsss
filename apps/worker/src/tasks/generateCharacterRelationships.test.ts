import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateCharacterRelationships } from './generateCharacterRelationships.js';

describe('generateCharacterRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate graph and dual-write table + legacy character.relationships', async () => {
    type TaskArgs = Parameters<typeof generateCharacterRelationships>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify([
        {
          fromCharacterId: 'c1',
          toCharacterId: 'c2',
          type: 'friendship',
          label: '朋友',
          description: '从小一起长大',
          intensity: 8,
          arc: [{ episodeOrder: 1, change: '建立信任', newIntensity: 8 }],
        },
        {
          fromCharacterId: 'c2',
          toCharacterId: 'c1',
          type: 'friendship',
          label: '朋友',
          description: '彼此依赖',
          intensity: 8,
          arc: [],
        },
      ]),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          contextCache: { narrativeCausalChain: {} },
        }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', name: '甲', relationships: null },
          { id: 'c2', name: '乙', relationships: null },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'c1' }),
      },
      characterRelationship: {
        upsert: vi.fn().mockResolvedValue({ id: 'r1' }),
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
      $transaction: vi.fn(async (txInput: unknown) => {
        if (typeof txInput === 'function') {
          return txInput(prisma);
        }
        return Promise.all(txInput as Promise<unknown>[]);
      }),
    };

    const result = await generateCharacterRelationships({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.relationshipCount).toBe(2);
    expect((prisma.characterRelationship.upsert as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect((prisma.character.update as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('should accept character names from model output and map to ids', async () => {
    type TaskArgs = Parameters<typeof generateCharacterRelationships>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify([
        {
          fromCharacterId: '甲',
          toCharacterId: '乙',
          type: 'mentor',
          label: '师徒',
          description: '传承关系',
          intensity: 7,
          arc: [],
        },
      ]),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          contextCache: { narrativeCausalChain: {} },
        }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', name: '甲', relationships: null },
          { id: 'c2', name: '乙', relationships: null },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'c1' }),
      },
      characterRelationship: {
        upsert: vi.fn().mockResolvedValue({ id: 'r1' }),
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
      $transaction: vi.fn(async (txInput: unknown) => {
        if (typeof txInput === 'function') {
          return txInput(prisma);
        }
        return Promise.all(txInput as Promise<unknown>[]);
      }),
    };

    const result = await generateCharacterRelationships({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    expect(result.relationshipCount).toBe(1);
    expect(
      (prisma.characterRelationship.upsert as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
        .where.projectId_fromCharacterId_toCharacterId,
    ).toEqual({
      projectId: 'p1',
      fromCharacterId: 'c1',
      toCharacterId: 'c2',
    });
  });

  it('should throw when no valid relationships can be resolved', async () => {
    type TaskArgs = Parameters<typeof generateCharacterRelationships>[0];

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify([
        {
          fromCharacterId: '未知角色A',
          toCharacterId: '未知角色B',
          type: 'enemy',
        },
      ]),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          contextCache: { narrativeCausalChain: {} },
        }),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', name: '甲', relationships: null },
          { id: 'c2', name: '乙', relationships: null },
        ]),
        update: vi.fn().mockResolvedValue({ id: 'c1' }),
      },
      characterRelationship: {
        upsert: vi.fn().mockResolvedValue({ id: 'r1' }),
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
      $transaction: vi.fn(async (txInput: unknown) => {
        if (typeof txInput === 'function') {
          return txInput(prisma);
        }
        return Promise.all(txInput as Promise<unknown>[]);
      }),
    };

    await expect(
      generateCharacterRelationships({
        prisma: prisma as unknown as TaskArgs['prisma'],
        teamId: 't1',
        projectId: 'p1',
        aiProfileId: 'a1',
        apiKeySecret: 'secret',
        updateProgress: async () => {},
      }),
    ).rejects.toThrow(/No valid character relationships/i);
  });
});
