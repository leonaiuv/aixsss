import { describe, expect, it } from 'vitest';
import {
  SceneScriptSchema,
  CharacterRelationshipSchema,
  EmotionArcSchema,
  ShotLanguageSchema,
  TransitionSchema,
  SoundCueSchema,
  SceneSoundDesignSchema,
  DurationEstimateSchema,
} from './index.js';

describe('Professional workflow schemas', () => {
  it('parses SceneScript with transition and sound cues', () => {
    const parsed = SceneScriptSchema.parse({
      sceneHeading: 'INT. 咖啡厅 - 日',
      actionLines: ['角色A走向吧台'],
      dialogueBlocks: [
        { character: '角色A', line: '来一杯美式。' },
        { character: '店员', parenthetical: '微笑', line: '好的。' },
      ],
      soundCues: [
        {
          id: 's1',
          type: 'sfx',
          description: '门铃声',
          intensity: 'subtle',
        },
      ],
      transitionOut: { type: 'cut', durationMs: 0 },
    });

    expect(parsed.sceneHeading).toContain('INT.');
    expect(parsed.soundCues).toHaveLength(1);
    expect(parsed.transitionOut?.type).toBe('cut');
  });

  it('validates CharacterRelationship intensity range', () => {
    const parsed = CharacterRelationshipSchema.parse({
      id: 'rel_1',
      fromCharacterId: 'char_a',
      toCharacterId: 'char_b',
      type: 'rivalry',
      label: '对手',
      intensity: 7,
      arc: [{ episodeOrder: 3, change: '由敌对转为互相利用', newIntensity: 5 }],
    });

    expect(parsed.intensity).toBe(7);
    expect(parsed.arc[0]?.episodeOrder).toBe(3);
  });

  it('parses EmotionArc points', () => {
    const parsed = EmotionArcSchema.parse({
      points: [
        {
          episodeOrder: 1,
          tension: 2,
          emotionalValence: 1,
          label: '起',
        },
        {
          episodeOrder: 2,
          sceneOrder: 4,
          tension: 7,
          emotionalValence: -2,
          beatName: '真相揭露',
        },
      ],
    });

    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[1]?.sceneOrder).toBe(4);
  });

  it('parses shot language and transition schemas', () => {
    const shot = ShotLanguageSchema.parse({
      shotSize: 'MCU',
      angle: 'eye_level',
      motion: 'dolly_in',
      lens: 'normal',
    });
    const transition = TransitionSchema.parse({
      type: 'dissolve',
      durationMs: 1200,
      motivation: '暗示时间流逝',
    });

    expect(shot.motion).toBe('dolly_in');
    expect(transition.type).toBe('dissolve');
  });

  it('parses sound and duration estimate schemas', () => {
    const cue = SoundCueSchema.parse({
      id: 'cue_1',
      type: 'bgm',
      description: '紧张弦乐',
    });
    const soundDesign = SceneSoundDesignSchema.parse({
      cues: [cue],
      masterMood: '紧张',
    });
    const duration = DurationEstimateSchema.parse({
      dialogueSec: 12,
      actionSec: 20,
      transitionSec: 1,
      pauseSec: 2,
      totalSec: 35,
      breakdown: [
        {
          sceneOrder: 1,
          seconds: 35,
          source: '对白+动作+转场+停顿',
        },
      ],
    });

    expect(soundDesign.cues[0]?.type).toBe('bgm');
    expect(duration.totalSec).toBe(35);
  });
});
