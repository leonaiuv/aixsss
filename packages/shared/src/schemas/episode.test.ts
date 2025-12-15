import { describe, it, expect } from 'vitest';
import { CoreExpressionSchema, EpisodePlanSchema } from './episode.js';

describe('Episode schemas', () => {
  it('accepts a valid EpisodePlan', () => {
    const plan = EpisodePlanSchema.parse({
      episodeCount: 2,
      reasoningBrief: '两集更紧凑',
      episodes: [
        {
          order: 1,
          title: '第1集',
          logline: '开场并埋下伏笔',
          mainCharacters: ['A', 'B'],
          beats: ['开场', '冲突', '转折', '钩子'],
          sceneScope: '城市夜景',
          cliffhanger: null,
        },
        {
          order: 2,
          title: '第2集',
          logline: '揭示真相并收束',
          mainCharacters: ['A'],
          beats: ['对抗', '反转', '高潮', '结局'],
          sceneScope: '旧工厂',
          cliffhanger: '',
        },
      ],
    });
    expect(plan.episodeCount).toBe(2);
    expect(plan.episodes).toHaveLength(2);
  });

  it('rejects EpisodePlan with mismatched episodeCount', () => {
    expect(() =>
      EpisodePlanSchema.parse({
        episodeCount: 3,
        episodes: [
          { order: 1, title: '1', logline: 'x', mainCharacters: [], beats: [], sceneScope: 'x' },
        ],
      }),
    ).toThrow();
  });

  it('rejects EpisodePlan with non-continuous orders', () => {
    expect(() =>
      EpisodePlanSchema.parse({
        episodeCount: 2,
        episodes: [
          { order: 2, title: '2', logline: 'x', mainCharacters: [], beats: [], sceneScope: 'x' },
          { order: 3, title: '3', logline: 'y', mainCharacters: [], beats: [], sceneScope: 'y' },
        ],
      }),
    ).toThrow();
  });

  it('rejects CoreExpression with invalid emotionalArc length', () => {
    expect(() =>
      CoreExpressionSchema.parse({
        theme: '主题',
        emotionalArc: ['起', '承', '转'],
        coreConflict: '冲突',
        payoff: [],
        visualMotifs: [],
        endingBeat: '结尾',
        nextHook: null,
      }),
    ).toThrow();
  });
});

