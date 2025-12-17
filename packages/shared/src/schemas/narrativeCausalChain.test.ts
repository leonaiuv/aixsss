import { describe, expect, it } from 'vitest';
import {
  NarrativeCausalChainSchema,
  Phase1ConflictEngineSchema,
  Phase3BeatFlowSchema,
  Phase4PlotLinesSchema,
} from './narrativeCausalChain.js';

describe('Narrative Causal Chain schemas', () => {
  it('Phase3BeatFlowSchema 支持 actMode/act/characters 的容错转换', () => {
    const parsed = Phase3BeatFlowSchema.parse({
      beatFlow: {
        actMode: '三幕',
        acts: [
          {
            act: '1',
            actName: '开端',
            beats: [
              {
                beatName: '发现线索',
                escalation: '2',
                interlock: '主线启动',
                location: '仓库',
                characters: '张三, 李四',
                visualHook: '信封特写',
                emotionalTone: '紧张',
                estimatedScenes: '3',
              },
            ],
          },
          { act: 2, actName: '发展', beats: null },
          { act: 3, actName: '高潮', beats: [] },
        ],
      },
    });

    expect(parsed.beatFlow.actMode).toBe('three_act');
    expect(parsed.beatFlow.acts[0].act).toBe(1);
    expect(parsed.beatFlow.acts[0].beats[0].escalation).toBe(2);
    expect(parsed.beatFlow.acts[0].beats[0].estimatedScenes).toBe(3);
    expect(parsed.beatFlow.acts[0].beats[0].characters).toEqual(['张三', '李四']);
    expect(parsed.beatFlow.acts[1].beats).toEqual([]);
  });

  it('Phase4PlotLinesSchema 支持 lineType/keyInterlocks/consistencyChecks 的容错转换', () => {
    const parsed = Phase4PlotLinesSchema.parse({
      plotLines: [
        {
          lineType: '主线',
          driver: '张三',
          statedGoal: '查明真相',
          trueGoal: '复仇',
          keyInterlocks: '发现线索, 对峙失控',
          pointOfNoReturn: '不可逆点',
        },
      ],
      consistencyChecks: {
        blindSpotDrivesAction: 'true',
        infoFlowChangesAtLeastTwo: 'false',
        coreConflictHasThreeWayTension: true,
        endingIrreversibleTriggeredByMultiLines: 'true',
        noRedundantRole: 'true',
        notes: ['ok'],
      },
    });

    expect(parsed.plotLines[0].lineType).toBe('main');
    expect(parsed.plotLines[0].keyInterlocks).toEqual(['发现线索', '对峙失控']);
    expect(parsed.consistencyChecks?.blindSpotDrivesAction).toBe(true);
    expect(parsed.consistencyChecks?.infoFlowChangesAtLeastTwo).toBe(false);
  });

  it('应保留扩展字段（含中文/非预期 key），避免在后续阶段解析时被 strip', () => {
    const phase1 = Phase1ConflictEngineSchema.parse({
      outlineSummary: '摘要',
      extraRoot: 'root-extra',
      conflictEngine: {
        coreObjectOrEvent: '账册',
        stakesByFaction: { 甲: '风险' },
        extraConflict: 'conflict-extra',
        firstMover: {
          initiator: '张三',
          hiddenIntent: '夺权',
          '幕后黑手（及少数知情者）': '七大宗室联盟（获得利益集团）',
        },
        necessityDerivation: ['若不行动则...'],
      },
    });

    expect((phase1 as unknown as Record<string, unknown>).extraRoot).toBe('root-extra');
    expect((phase1.conflictEngine as unknown as Record<string, unknown>).extraConflict).toBe(
      'conflict-extra',
    );
    expect(
      (phase1.conflictEngine?.firstMover as unknown as Record<string, unknown>)[
        '幕后黑手（及少数知情者）'
      ],
    ).toBe('七大宗室联盟（获得利益集团）');

    const chain = NarrativeCausalChainSchema.parse({
      completedPhase: 2,
      conflictEngine: {
        coreObjectOrEvent: '账册',
        stakesByFaction: {},
        firstMover: {
          initiator: '张三',
          '幕后黑手': '七大宗室联盟',
        },
        necessityDerivation: [],
        '额外字段': { note: 'keep-me' },
      },
      '根级扩展': { a: 1 },
    });

    expect((chain as unknown as Record<string, unknown>)['根级扩展']).toEqual({ a: 1 });
    expect((chain.conflictEngine as unknown as Record<string, unknown>)['额外字段']).toEqual({
      note: 'keep-me',
    });
    expect(
      (chain.conflictEngine?.firstMover as unknown as Record<string, unknown>)['幕后黑手'],
    ).toBe('七大宗室联盟');
  });
});


