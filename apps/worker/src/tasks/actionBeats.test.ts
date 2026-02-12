import { describe, expect, it } from 'vitest';
import {
  keyframeGroupsToStoryboardPromptV2,
  validateContinuity,
  validateKeyframeGroup,
  type FrameSpec,
  type KeyframeGroup,
} from './actionBeats.js';

describe('actionBeats validators', () => {
  it('validateKeyframeGroup passes for a clear start/mid/end progression', () => {
    const baseSubject = {
      character_id: 'C_A',
      name: 'A',
      position_in_frame: 'left mid',
      body_orientation: 'toward_camera',
      pose: 'sitting',
      action_snapshot: 'right hand holding a cup, frozen moment',
      expression: 'neutral',
      gaze: 'forward',
      hands: { left: 'on_table', right: 'holding_cup' },
      props: [{ name: 'cup', state: 'in_right_hand' }],
    };

    const start = {
      used_anchors: ['table', 'window'],
      subjects: [baseSubject],
      composition: { rule: 'rule_of_thirds', focus: 'A', depth_hint: 'shallow' },
      bubble_space: { need: true, area: 'top_right', size: 'medium' },
    };

    const mid = {
      ...start,
      subjects: [
        {
          ...baseSubject,
          pose: 'half_rise',
          action_snapshot: 'torso leaning forward, cup lowered, frozen moment',
          gaze: 'down',
          hands: { left: 'pushing_chair', right: 'holding_cup_low' },
        },
      ],
    };

    const end = {
      ...start,
      subjects: [
        {
          ...baseSubject,
          position_in_frame: 'center mid',
          pose: 'standing',
          action_snapshot: 'cup placed on table, right hand just released, frozen moment',
          hands: { left: 'at_side', right: 'open_empty' },
          props: [{ name: 'cup', state: 'on_table' }],
        },
      ],
    };

    const group: KeyframeGroup = {
      beat_id: 'B1',
      camera: { shot_size: 'medium', angle: 'eye_level', lens_hint: '35mm', aspect_ratio: '16:9' },
      frames: {
        start: { frame_spec: start },
        mid: { frame_spec: mid },
        end: { frame_spec: end },
      },
      negative: { avoid: ['watermark', 'extra characters'] },
    };

    expect(validateKeyframeGroup(group)).toEqual([]);
  });

  it('validateKeyframeGroup rejects continuous narration words in action_snapshot', () => {
    const group: KeyframeGroup = {
      beat_id: 'B1',
      frames: {
        start: {
          frame_spec: {
            used_anchors: ['table'],
            subjects: [
              {
                character_id: 'C_A',
                name: 'A',
                position_in_frame: 'left',
                body_orientation: 'toward_camera',
                pose: 'standing',
                action_snapshot: 'then starts to raise right hand',
                expression: 'neutral',
                gaze: 'forward',
              },
            ],
          },
        },
        mid: {
          frame_spec: {
            used_anchors: ['table'],
            subjects: [
              {
                character_id: 'C_A',
                name: 'A',
                position_in_frame: 'left',
                body_orientation: 'toward_camera',
                pose: 'standing',
                action_snapshot: 'right hand raised, frozen moment',
                expression: 'neutral',
                gaze: 'forward',
              },
            ],
          },
        },
        end: {
          frame_spec: {
            used_anchors: ['table'],
            subjects: [
              {
                character_id: 'C_A',
                name: 'A',
                position_in_frame: 'left',
                body_orientation: 'toward_camera',
                pose: 'standing',
                action_snapshot: 'right hand fully raised, frozen moment',
                expression: 'neutral',
                gaze: 'forward',
              },
            ],
          },
        },
      },
    };

    const issues = validateKeyframeGroup(group);
    expect(issues.some((i) => i.path.includes('action_snapshot'))).toBe(true);
  });

  it('validateContinuity detects a jump between prev_end and next_start', () => {
    const prevEnd: FrameSpec = {
      used_anchors: ['table', 'window'],
      subjects: [
        {
          character_id: 'C_A',
          name: 'A',
          position_in_frame: 'left',
          body_orientation: 'toward_camera',
          pose: 'standing',
          action_snapshot: 'frozen',
          expression: 'neutral',
          gaze: 'forward',
          hands: { left: 'at_side', right: 'open_empty' },
          props: [{ name: 'cup', state: 'on_table' }],
        },
      ],
    };

    const nextStart: FrameSpec = {
      ...prevEnd,
      subjects: [
        {
          ...prevEnd.subjects[0],
          position_in_frame: 'right',
        },
      ],
    };

    const issues = validateContinuity(prevEnd, nextStart);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('keyframeGroupsToStoryboardPromptV2 应输出固定 9-shot 顺序', () => {
    const mkFrame = (suffix: string): FrameSpec => ({
      used_anchors: ['table', 'window'],
      subjects: [
        {
          character_id: 'C_A',
          name: 'A',
          position_in_frame: 'left',
          body_orientation: 'toward_camera',
          pose: `pose_${suffix}`,
          action_snapshot: `action_${suffix}`,
          expression: 'neutral',
          gaze: 'forward',
          hands: { left: 'at_side', right: 'open_empty' },
          props: [{ name: 'cup', state: `state_${suffix}` }],
        },
      ],
      composition: { rule: 'rule_of_thirds', focus: 'A', depth_hint: 'shallow' },
      bubble_space: { need: true, area: 'top_right', size: 'medium' },
    });

    const groups: KeyframeGroup[] = [
      {
        beat_id: 'B1',
        camera: { shot_size: 'LS', angle: 'eye_level', lens_hint: '35mm', aspect_ratio: '16:9' },
        frames: {
          start: { frame_spec: mkFrame('1s') },
          mid: { frame_spec: mkFrame('1m') },
          end: { frame_spec: mkFrame('1e') },
        },
        negative: { avoid: ['watermark'] },
      },
      {
        beat_id: 'B2',
        camera: { shot_size: 'MS', angle: 'eye_level', lens_hint: '50mm', aspect_ratio: '16:9' },
        frames: {
          start: { frame_spec: mkFrame('2s') },
          mid: { frame_spec: mkFrame('2m') },
          end: { frame_spec: mkFrame('2e') },
        },
        negative: { avoid: ['extra characters'] },
      },
      {
        beat_id: 'B3',
        camera: { shot_size: 'CU', angle: 'low_angle', lens_hint: '85mm', aspect_ratio: '16:9' },
        frames: {
          start: { frame_spec: mkFrame('3s') },
          mid: { frame_spec: mkFrame('3m') },
          end: { frame_spec: mkFrame('3e') },
        },
      },
    ];

    const out = keyframeGroupsToStoryboardPromptV2(groups);
    const parsed = JSON.parse(out) as {
      storyboard_config: { layout: string };
      shots: Array<{ type: string }>;
    };

    expect(parsed.storyboard_config.layout).toBe('3x3_grid');
    expect(parsed.shots).toHaveLength(9);
    expect(parsed.shots.map((s) => s.type)).toEqual([
      'ELS',
      'LS',
      'MLS',
      'MS',
      'MCU',
      'CU',
      'ECU',
      'Low Angle',
      'High Angle',
    ]);
  });
});
