import { describe, expect, it } from 'vitest';
import { isStructuredOutput } from './formatFix.js';

function buildValidShot(idx: number, type: string, typeCn: string) {
  return {
    shot_number: `分镜${idx + 1}`,
    type,
    type_cn: typeCn,
    description: `画面内容${idx + 1}，带有统一光影和氛围`,
    angle: 'Eye level',
    focus: '叙事推进',
  };
}

describe('formatFix keyframe_prompt V2', () => {
  it('应识别合法的 storyboard_config + shots + technical_requirements', () => {
    const data = {
      storyboard_config: {
        layout: '3x3_grid',
        aspect_ratio: '16:9',
        style: 'modern_thriller',
        visual_anchor: {
          character: '黑色短发，深灰风衣，左眉有浅疤',
          environment: '废弃地铁站台，冷色调，低饱和',
          lighting: '戏剧侧光',
          mood: '紧张',
        },
      },
      shots: [
        buildValidShot(0, 'ELS', '大远景'),
        buildValidShot(1, 'LS', '远景'),
        buildValidShot(2, 'MLS', '中远景'),
        buildValidShot(3, 'MS', '中景'),
        buildValidShot(4, 'MCU', '中近景'),
        buildValidShot(5, 'CU', '近景'),
        buildValidShot(6, 'ECU', '特写'),
        buildValidShot(7, 'Low Angle', '仰拍'),
        buildValidShot(8, 'High Angle', '俯拍'),
      ],
      technical_requirements: {
        consistency: 'ABSOLUTE: same face/costume/lighting across all 9 panels',
        composition: "Label '分镜X' top-left corner, cinematic ratio",
        quality: 'Photorealistic, 8K, film grain',
      },
    };

    expect(isStructuredOutput('keyframe_prompt', JSON.stringify(data))).toBe(true);
  });

  it('shots 缺失或数量不足 9 时应判定失败', () => {
    const data = {
      storyboard_config: { layout: '3x3_grid' },
      shots: [{ shot_number: '分镜1', type: 'ELS', type_cn: '大远景' }],
      technical_requirements: { consistency: 'x', composition: 'y', quality: 'z' },
    };

    expect(isStructuredOutput('keyframe_prompt', JSON.stringify(data))).toBe(false);
  });

  it('固定景别顺序不正确时应判定失败', () => {
    const data = {
      storyboard_config: {
        layout: '3x3_grid',
        aspect_ratio: '16:9',
        style: 'cinematic_sci_fi',
        visual_anchor: {
          character: '角色锚点',
          environment: '环境锚点',
          lighting: '灯光锚点',
          mood: '情绪锚点',
        },
      },
      shots: [
        buildValidShot(0, 'LS', '远景'),
        buildValidShot(1, 'ELS', '大远景'),
        buildValidShot(2, 'MLS', '中远景'),
        buildValidShot(3, 'MS', '中景'),
        buildValidShot(4, 'MCU', '中近景'),
        buildValidShot(5, 'CU', '近景'),
        buildValidShot(6, 'ECU', '特写'),
        buildValidShot(7, 'Low Angle', '仰拍'),
        buildValidShot(8, 'High Angle', '俯拍'),
      ],
      technical_requirements: {
        consistency: 'ABSOLUTE: same',
        composition: 'Label',
        quality: 'Photorealistic',
      },
    };

    expect(isStructuredOutput('keyframe_prompt', JSON.stringify(data))).toBe(false);
  });
});
