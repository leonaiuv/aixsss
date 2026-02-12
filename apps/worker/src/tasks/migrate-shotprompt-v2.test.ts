import { describe, expect, it } from 'vitest';
import {
  LEGACY_SHOT_ORDER,
  convertLegacyShotPromptToV2,
  isStoryboardPromptV2,
} from './migrate-shotprompt-v2.js';

describe('migrate-shotprompt-v2', () => {
  it('应把 legacy keyframes 结构迁移为 v2 storyboard 结构', () => {
    const legacy = {
      camera: { type: 'MS', angle: 'eye_level', aspectRatio: '16:9' },
      keyframes: Object.fromEntries(
        Array.from({ length: 9 }).map((_, idx) => [
          `KF${idx}`,
          {
            zh: {
              subjects: [{ name: '主角', position: `位置${idx + 1}`, action: `动作${idx + 1}` }],
              usedAnchors: ['站台灯箱', '轨道线'],
              composition: `构图${idx + 1}`,
              bubbleSpace: '右上',
            },
          },
        ]),
      ),
      avoid: { zh: '不要水印', en: 'no watermark' },
    };

    const out = convertLegacyShotPromptToV2(JSON.stringify(legacy));
    expect(out).not.toBeNull();
    expect(isStoryboardPromptV2(out!)).toBe(true);
    expect(out!.shots).toHaveLength(9);
    expect(out!.shots.map((s) => s.type)).toEqual(LEGACY_SHOT_ORDER);
  });

  it('已是 v2 时应幂等', () => {
    const v2 = {
      storyboard_config: {
        layout: '3x3_grid',
        aspect_ratio: '16:9',
        style: 'modern_thriller',
        visual_anchor: {
          character: '角色锚点',
          environment: '环境锚点',
          lighting: '灯光锚点',
          mood: '紧张',
        },
      },
      shots: Array.from({ length: 9 }).map((_, i) => ({
        shot_number: `分镜${i + 1}`,
        type: LEGACY_SHOT_ORDER[i],
        type_cn: 'x',
        description: `描述${i + 1}`,
        angle: 'Eye level',
        focus: '叙事',
      })),
      technical_requirements: {
        consistency: 'ABSOLUTE',
        composition: 'Label',
        quality: '8K',
      },
    };

    const out = convertLegacyShotPromptToV2(JSON.stringify(v2));
    expect(out).toEqual(v2);
  });
});
