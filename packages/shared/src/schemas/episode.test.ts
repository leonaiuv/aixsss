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

  it('accepts EpisodePlan up to 100 episodes', () => {
    const episodes = Array.from({ length: 100 }, (_, idx) => ({
      order: idx + 1,
      title: `第${idx + 1}集`,
      logline: `第${idx + 1}集推进`,
      mainCharacters: ['A'],
      beats: ['推进'],
      sceneScope: `场景${idx + 1}`,
      cliffhanger: null,
    }));

    const parsed = EpisodePlanSchema.parse({
      episodeCount: 100,
      reasoningBrief: '长篇规划',
      episodes,
    });
    expect(parsed.episodeCount).toBe(100);
    expect(parsed.episodes).toHaveLength(100);
  });

  it('rejects EpisodePlan beyond 100 episodes', () => {
    const episodes = Array.from({ length: 101 }, (_, idx) => ({
      order: idx + 1,
      title: `第${idx + 1}集`,
      logline: `第${idx + 1}集推进`,
      mainCharacters: ['A'],
      beats: ['推进'],
      sceneScope: `场景${idx + 1}`,
      cliffhanger: null,
    }));

    expect(() =>
      EpisodePlanSchema.parse({
        episodeCount: 101,
        episodes,
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

  it('accepts optional emotionArcPoints in CoreExpression', () => {
    const parsed = CoreExpressionSchema.parse({
      theme: '主题',
      emotionalArc: ['起', '承', '转', '合'],
      coreConflict: '冲突',
      payoff: [],
      visualMotifs: [],
      endingBeat: '结尾',
      nextHook: null,
      emotionArcPoints: [
        {
          episodeOrder: 1,
          sceneOrder: 2,
          tension: 6,
          emotionalValence: -1,
          beatName: '转折',
        },
      ],
    });

    expect(parsed.emotionArcPoints).toHaveLength(1);
    expect(parsed.emotionArcPoints?.[0]?.tension).toBe(6);
  });
});
