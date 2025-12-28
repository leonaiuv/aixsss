import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { generateEpisodeCoreExpression } from './generateEpisodeCoreExpression.js';

function getWhere(q: unknown): Record<string, unknown> | null {
  if (!q || typeof q !== 'object') return null;
  const where = (q as Record<string, unknown>)['where'];
  if (!where || typeof where !== 'object') return null;
  return where as Record<string, unknown>;
}

function getSelect(q: unknown): Record<string, unknown> | null {
  if (!q || typeof q !== 'object') return null;
  const select = (q as Record<string, unknown>)['select'];
  if (!select || typeof select !== 'object') return null;
  return select as Record<string, unknown>;
}

function getWhereOrder(q: unknown): number | null {
  const where = getWhere(q);
  const order = where?.['order'];
  return typeof order === 'number' ? order : null;
}

describe('generateEpisodeCoreExpression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockChatOk() {
    (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        theme: '主题',
        emotionalArc: ['起', '承', '转', '合'],
        coreConflict: '冲突',
        payoff: ['回报'],
        visualMotifs: ['意象'],
        endingBeat: '结尾',
        nextHook: null,
      }),
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });
  }

  it('无相邻集：order=1 时 prev/next 为 null，prompt 有占位且不出现 undefined', async () => {
    type TaskArgs = Parameters<typeof generateEpisodeCoreExpression>[0];

    mockChatOk();

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '',
          artStyleConfig: null,
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockImplementation(async (q: unknown) => {
          const where = getWhere(q);
          const id = where?.['id'];
          const order = where?.['order'];
          if (id === 'e1') {
            return { id: 'e1', order: 1, title: '第1集', summary: '本集概要', outline: { a: 1 } };
          }
          if (order === 0) return null;
          if (order === 2) return null;
          return null;
        }),
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
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
      worldViewElement: { findMany: vi.fn().mockResolvedValue([]) },
      character: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await generateEpisodeCoreExpression({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const episodeFindFirstCalls = (prisma.episode.findFirst as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0],
    );
    expect(episodeFindFirstCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'p1', order: 0 }) }),
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'p1', order: 2 }) }),
      ]),
    );

    const prevCall = episodeFindFirstCalls.find((c) => getWhereOrder(c) === 0);
    const nextCall = episodeFindFirstCalls.find((c) => getWhereOrder(c) === 2);
    expect(getSelect(prevCall)).toMatchObject({
      order: true,
      title: true,
      summary: true,
      outline: true,
      coreExpression: true,
    });
    expect(getSelect(nextCall)).toMatchObject({
      order: true,
      title: true,
      summary: true,
      outline: true,
      coreExpression: true,
    });

    const messages = (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<{
      role: string;
      content: string;
    }>;
    const prompt = messages[0]?.content ?? '';

    expect(prompt).toContain('相邻集衔接');
    expect(prompt).toContain('上一集（若有）：');
    expect(prompt).toContain('下一集（若有）：');
    expect(prompt).toContain('集数：-');
    expect(prompt).toContain('故事核心（可选）：-');
    expect(prompt).toContain('主角核心（可选）：-');
    expect(prompt).not.toContain('undefined');
  });

  it('有相邻集但无 coreExpression：prompt 输出 null 且不崩', async () => {
    type TaskArgs = Parameters<typeof generateEpisodeCoreExpression>[0];

    mockChatOk();

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '',
          artStyleConfig: null,
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockImplementation(async (q: unknown) => {
          const where = getWhere(q);
          const id = where?.['id'];
          const order = where?.['order'];
          if (id === 'e2') {
            return { id: 'e2', order: 2, title: '第2集', summary: '本集概要', outline: null };
          }
          if (order === 1) {
            return {
              order: 1,
              title: '第1集',
              summary: '上一集一句话',
              outline: { x: 1 },
              coreExpression: null,
            };
          }
          if (order === 3) return null;
          return null;
        }),
        update: vi.fn().mockResolvedValue({ id: 'e2' }),
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
      worldViewElement: { findMany: vi.fn().mockResolvedValue([]) },
      character: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await generateEpisodeCoreExpression({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e2',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const messages = (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<{
      role: string;
      content: string;
    }>;
    const prompt = messages[0]?.content ?? '';

    expect(prompt).toContain('Core Expression（若已生成，按字符截断）：null');
  });

  it('相邻集 outline/coreExpression 很长：clipJson 截断生效（<=阈值，且带 …）', async () => {
    type TaskArgs = Parameters<typeof generateEpisodeCoreExpression>[0];

    mockChatOk();

    const longText = 'a'.repeat(10_000);

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '',
          artStyleConfig: null,
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockImplementation(async (q: unknown) => {
          const where = getWhere(q);
          const id = where?.['id'];
          const order = where?.['order'];
          if (id === 'e2') {
            return { id: 'e2', order: 2, title: '第2集', summary: '本集概要', outline: null };
          }
          if (order === 1) {
            return {
              order: 1,
              title: '第1集',
              summary: '上一集一句话',
              outline: { longText },
              coreExpression: { longText },
            };
          }
          if (order === 3) return null;
          return null;
        }),
        update: vi.fn().mockResolvedValue({ id: 'e2' }),
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
      worldViewElement: { findMany: vi.fn().mockResolvedValue([]) },
      character: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await generateEpisodeCoreExpression({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e2',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const messages = (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<{
      role: string;
      content: string;
    }>;
    const prompt = messages[0]?.content ?? '';

    const outlineLine = prompt.match(/Outline（按字符截断）：([^\n]*)/);
    expect(outlineLine?.[1]).toBeTruthy();
    expect(outlineLine![1].length).toBeLessThanOrEqual(1800);
    expect(outlineLine![1]).toContain('…');
    expect(outlineLine![1]).toContain('截断');

    const coreLine = prompt.match(/Core Expression（若已生成，按字符截断）：([^\n]*)/);
    expect(coreLine?.[1]).toBeTruthy();
    expect(coreLine![1].length).toBeLessThanOrEqual(1800);
    expect(coreLine![1]).toContain('…');
    expect(coreLine![1]).toContain('截断');
  });

  it('schema 不变：providerConfig.responseFormat 仍为 episode_core_expression json_schema', async () => {
    type TaskArgs = Parameters<typeof generateEpisodeCoreExpression>[0];

    mockChatOk();

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '',
          artStyleConfig: null,
          contextCache: {},
        }),
      },
      episode: {
        findFirst: vi.fn().mockImplementation(async (q: unknown) => {
          const where = getWhere(q);
          const id = where?.['id'];
          if (id === 'e1') {
            return { id: 'e1', order: 1, title: '第1集', summary: '本集概要', outline: null };
          }
          return null;
        }),
        update: vi.fn().mockResolvedValue({ id: 'e1' }),
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
      worldViewElement: { findMany: vi.fn().mockResolvedValue([]) },
      character: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await generateEpisodeCoreExpression({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      episodeId: 'e1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      updateProgress: async () => {},
    });

    const providerConfig = (chatWithProvider as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown;
    const responseFormat =
      providerConfig && typeof providerConfig === 'object'
        ? (providerConfig as Record<string, unknown>)['responseFormat']
        : null;
    expect(responseFormat).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'episode_core_expression', strict: true },
    });
  });
});
