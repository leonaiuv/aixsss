import { describe, expect, it } from 'vitest';
import { mergeSingleKeyframePrompt } from './keyframePromptMerge';

function buildStoryboardV2(descPrefix: string) {
  return {
    storyboard_config: {
      layout: '3x3_grid',
      aspect_ratio: '16:9',
      style: 'modern_thriller',
      visual_anchor: {
        character: '角色锚点',
        environment: '环境锚点',
        lighting: '灯光锚点',
        mood: '情绪锚点',
      },
    },
    shots: [
      { shot_number: '分镜1', type: 'ELS', type_cn: '大远景', description: `${descPrefix}-0`, angle: 'Eye level', focus: '建立环境' },
      { shot_number: '分镜2', type: 'LS', type_cn: '远景', description: `${descPrefix}-1`, angle: 'Eye level', focus: '动作展示' },
      { shot_number: '分镜3', type: 'MLS', type_cn: '中远景', description: `${descPrefix}-2`, angle: 'Slight low angle', focus: '人物关系' },
      { shot_number: '分镜4', type: 'MS', type_cn: '中景', description: `${descPrefix}-3`, angle: 'Eye level', focus: '肢体语言' },
      { shot_number: '分镜5', type: 'MCU', type_cn: '中近景', description: `${descPrefix}-4`, angle: 'Slight high angle', focus: '情绪表达' },
      { shot_number: '分镜6', type: 'CU', type_cn: '近景', description: `${descPrefix}-5`, angle: 'Straight on', focus: '眼神细节' },
      { shot_number: '分镜7', type: 'ECU', type_cn: '特写', description: `${descPrefix}-6`, angle: 'Macro', focus: '关键道具' },
      { shot_number: '分镜8', type: 'Low Angle', type_cn: '仰拍', description: `${descPrefix}-7`, angle: 'Extreme low angle', focus: '权力关系' },
      { shot_number: '分镜9', type: 'High Angle', type_cn: '俯拍', description: `${descPrefix}-8`, angle: 'Top-down', focus: '上帝视角' },
    ],
    technical_requirements: {
      consistency: 'ABSOLUTE',
      composition: 'Label 分镜',
      quality: 'Photorealistic 8K',
    },
  };
}

describe('mergeSingleKeyframePrompt', () => {
  it('首次生成单帧时，仅写入目标帧，其他帧保持为空', () => {
    const regenerated = JSON.stringify(buildStoryboardV2('new'));
    const out = mergeSingleKeyframePrompt({
      existingPrompt: '',
      regeneratedPrompt: regenerated,
      keyframeKey: 'KF3',
    });
    const parsed = JSON.parse(out) as { shots: Array<{ description?: string }> };
    expect(parsed.shots).toHaveLength(9);
    expect(parsed.shots[3]?.description).toBe('new-3');
    expect(parsed.shots[0]?.description || '').toBe('');
    expect(parsed.shots[8]?.description || '').toBe('');
  });

  it('多次重生单帧时，保留其他帧，覆盖目标帧', () => {
    const existing = JSON.stringify(buildStoryboardV2('old'));
    const regenerated = JSON.stringify(buildStoryboardV2('new'));
    const out = mergeSingleKeyframePrompt({
      existingPrompt: existing,
      regeneratedPrompt: regenerated,
      keyframeKey: 'KF5',
    });
    const parsed = JSON.parse(out) as { shots: Array<{ description?: string }> };
    expect(parsed.shots[5]?.description).toBe('new-5');
    expect(parsed.shots[4]?.description).toBe('old-4');
    expect(parsed.shots[6]?.description).toBe('old-6');
  });

  it('已有旧行标签格式时，单帧重生应尽量保留其他帧内容', () => {
    const existing = [
      'KF0_ZH: old-kf0',
      'KF1_ZH: old-kf1',
      'KF2_ZH: old-kf2',
      'KF3_ZH: old-kf3',
      'KF4_ZH: old-kf4',
      'KF5_ZH: old-kf5',
      'KF6_ZH: old-kf6',
      'KF7_ZH: old-kf7',
      'KF8_ZH: old-kf8',
    ].join('\n');
    const regenerated = JSON.stringify(buildStoryboardV2('new'));
    const out = mergeSingleKeyframePrompt({
      existingPrompt: existing,
      regeneratedPrompt: regenerated,
      keyframeKey: 'KF1',
    });
    const parsed = JSON.parse(out) as { shots: Array<{ description?: string }> };
    expect(parsed.shots[1]?.description).toBe('new-1');
    expect(parsed.shots[0]?.description).toBe('old-kf0');
    expect(parsed.shots[8]?.description).toBe('old-kf8');
  });
});
