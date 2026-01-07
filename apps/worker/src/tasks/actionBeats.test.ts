import { describe, expect, it } from 'vitest';
import { validateContinuity, validateKeyframeGroup, type FrameSpec, type KeyframeGroup } from './actionBeats.js';

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
});
