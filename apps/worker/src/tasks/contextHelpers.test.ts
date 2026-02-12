import { describe, expect, it } from 'vitest';
import { extractKF0FromShotPrompt, extractKF8FromShotPrompt } from './contextHelpers.js';

describe('contextHelpers - V2 storyboard shots extraction', () => {
  const v2 = JSON.stringify({
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
      type: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'Low Angle', 'High Angle'][i],
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
  });

  it('应提取 shots[0] 作为 KF0', () => {
    const kf0 = extractKF0FromShotPrompt(v2);
    expect(kf0).toContain('分镜1');
    expect(kf0).toContain('ELS');
  });

  it('应提取 shots[8] 作为 KF8', () => {
    const kf8 = extractKF8FromShotPrompt(v2);
    expect(kf8).toContain('分镜9');
    expect(kf8).toContain('High Angle');
  });
});
