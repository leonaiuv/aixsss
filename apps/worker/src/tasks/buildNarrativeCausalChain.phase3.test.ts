import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../providers/index.js', () => ({
  chatWithProvider: vi.fn(),
}));

vi.mock('../crypto/apiKeyCrypto.js', () => ({
  decryptApiKey: () => 'test-key',
}));

import { chatWithProvider } from '../providers/index.js';
import { buildNarrativeCausalChain } from './buildNarrativeCausalChain.js';

describe('buildNarrativeCausalChain phase 3 (incremental)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs 3A outline then 3B per-act fill, with checkpoint writes', async () => {
    type TaskArgs = Parameters<typeof buildNarrativeCausalChain>[0];

    const outline = {
      beatFlow: {
        actMode: 'three_act',
        acts: [
          {
            act: 1,
            actName: '开端',
            beats: [
              { beatName: '发现线索', escalation: 2, interlock: '主线启动' },
              { beatName: '试探对方', escalation: 3, interlock: '暗线1触发' },
              { beatName: '误判加深', escalation: 4, interlock: '信息差扩大' },
            ],
          },
          {
            act: 2,
            actName: '发展',
            beats: [
              { beatName: '追查升级', escalation: 5, interlock: '暗线2交叉' },
              { beatName: '对峙失控', escalation: 6, interlock: '主线受阻' },
              { beatName: '背叛显形', escalation: 7, interlock: '暗线1反噬' },
            ],
          },
          {
            act: 3,
            actName: '高潮',
            beats: [
              { beatName: '真相逼近', escalation: 8, interlock: '多线汇合' },
              { beatName: '不可逆点', escalation: 9, interlock: '引爆点' },
              { beatName: '终局爆发', escalation: 10, interlock: '收束' },
            ],
          },
        ],
      },
    };

    const actDetail = (act: number, actName: string, beats: string[]) => ({
      beatFlow: {
        actMode: 'three_act',
        acts: [
          {
            act,
            actName,
            beats: beats.map((name, idx) => ({
              beatName: name,
              surfaceEvent: `事件${act}-${idx + 1}`,
              infoFlow: `信息流${act}-${idx + 1}`,
              escalation: Math.min(10, 1 + act + idx),
              interlock: `咬合${act}-${idx + 1}`,
              location: `地点${act}`,
              characters: ['张三'],
              visualHook: `画面${act}-${idx + 1}`,
              emotionalTone: '紧张',
              estimatedScenes: 2,
            })),
          },
        ],
      },
    });

    (chatWithProvider as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ content: JSON.stringify(outline), tokenUsage: { prompt: 1, completion: 1, total: 2 } })
      .mockResolvedValueOnce({
        content: JSON.stringify(actDetail(1, '开端', ['发现线索', '试探对方', '误判加深'])),
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(actDetail(2, '发展', ['追查升级', '对峙失控', '背叛显形'])),
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(actDetail(3, '高潮', ['真相逼近', '不可逆点', '终局爆发'])),
        tokenUsage: { prompt: 1, completion: 1, total: 2 },
      });

    const existingChain = {
      version: '2.0.0',
      validationStatus: 'incomplete',
      revisionSuggestions: [],
      completedPhase: 2,
      outlineSummary: '三幕故事骨架',
      conflictEngine: { coreObjectOrEvent: '账册', stakesByFaction: {} },
      infoVisibilityLayers: [],
      characterMatrix: [],
      beatFlow: null,
      plotLines: [],
      consistencyChecks: null,
    };

    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'p1',
          summary: '故事梗概',
          style: '风格',
          artStyleConfig: null,
          contextCache: { narrativeCausalChain: existingChain },
        }),
        update: vi.fn().mockResolvedValue({ id: 'p1' }),
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
      worldViewElement: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      character: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const res = await buildNarrativeCausalChain({
      prisma: prisma as unknown as TaskArgs['prisma'],
      teamId: 't1',
      projectId: 'p1',
      aiProfileId: 'a1',
      apiKeySecret: 'secret',
      phase: 3,
      updateProgress: async () => {},
    });

    expect(res.phase).toBe(3);
    expect(res.completedPhase).toBe(3);
    const chatMock = chatWithProvider as unknown as ReturnType<typeof vi.fn>;
    expect(chatMock.mock.calls).toHaveLength(4);

    const updateMock = prisma.project.update as unknown as ReturnType<typeof vi.fn>;
    const updates = updateMock.mock.calls;
    expect(updates.length).toBe(5); // 3A 目录写入 + 3 幕写入 + 最终写入

    const firstCache = updates[0][0].data.contextCache;
    expect(firstCache.narrativeCausalChain.completedPhase).toBe(2);

    const lastCache = updates[updates.length - 1][0].data.contextCache;
    expect(lastCache.narrativeCausalChain.completedPhase).toBe(3);
    expect(lastCache.narrativeCausalChain.beatFlow.acts[0].beats[0].location).toBeTruthy();
  });
});


