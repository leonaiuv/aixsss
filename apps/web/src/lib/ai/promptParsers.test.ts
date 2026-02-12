import { describe, it, expect } from 'vitest';
import {
  parseKeyframePromptText,
  parseMotionPromptText,
  parseSceneAnchorText,
} from './promptParsers';

describe('promptParsers', () => {
  describe('parseKeyframePromptText', () => {
    it('空文本应返回非结构化结果', () => {
      const parsed = parseKeyframePromptText('');
      expect(parsed.isStructured).toBe(false);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.keyframeKeys).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(0);
    });

    it('应解析 KF0/KF1/KF2 的中英双语（其余关键帧为空）', () => {
      const text = [
        'KF0_ZH: 室内，靠窗的桌边，人物静止站立',
        'KF0_EN: interior, by the window-side table, person standing still',
        'KF1_ZH: 同一机位，人物坐下，手扶桌面（定格）',
        'KF1_EN: same camera, person seated, hand on the table (frozen moment)',
        'KF2_ZH: 人物拿起信封，停在胸前（定格）',
        'KF2_EN: person holding an envelope at chest level (frozen moment)',
      ].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(3);
      expect(parsed.keyframes[0].zh).toContain('靠窗');
      expect(parsed.keyframes[0].en).toContain('window-side');
      expect(parsed.keyframes[2].zh).toContain('信封');
      expect(parsed.keyframes[2].en).toContain('envelope');
      expect(parsed.keyframes[3].zh).toBeUndefined();
      expect(parsed.keyframes[8].en).toBeUndefined();
    });

    it('应支持多行续写（续行归入最近的标签）', () => {
      const text = [
        'KF0_ZH: 室内，冷青色桌面，微尘光束',
        '补充：桌上有翻倒的画笔筒',
        'KF0_EN: interior, cool cyan tabletop, dust in light beams',
        'extra: overturned brush holder on the table',
        'AVOID_ZH: 不要文字，不要水印',
        'AVOID_EN: no text, no watermark',
      ].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(1);
      expect(parsed.keyframes[0].zh).toContain('翻倒的画笔筒');
      expect(parsed.keyframes[0].en).toContain('overturned brush holder');
      expect(parsed.avoid?.zh).toContain('不要水印');
      expect(parsed.avoid?.en).toContain('no watermark');
    });

    it('大小写不敏感（kf0_zh/kf0_en 也可解析）', () => {
      const text = ['kf0_zh: 中文内容', 'kf0_en: English content'].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(1);
      expect(parsed.keyframes[0].zh).toBe('中文内容');
      expect(parsed.keyframes[0].en).toBe('English content');
    });

    it('应支持中文冒号与缩进（KF0_ZH：/ KF0_EN：）', () => {
      const text = [
        '  KF0_ZH：中文内容',
        '\tKF0_EN：English content',
        'AVOID_ZH：不要文字',
        'AVOID_EN：no text',
      ].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(1);
      expect(parsed.keyframes[0].zh).toBe('中文内容');
      expect(parsed.keyframes[0].en).toBe('English content');
      expect(parsed.avoid?.zh).toBe('不要文字');
      expect(parsed.avoid?.en).toBe('no text');
    });

    it('无法识别的内容应进入 rawUnlabeled', () => {
      const text = ['这是一段没有标签的旧格式提示词', 'another unlabeled line'].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(false);
      expect(parsed.rawUnlabeled).toContain('旧格式');
      expect(parsed.rawUnlabeled).toContain('another unlabeled line');
    });

    it('应解析 V2 storyboard JSON 并映射为 9 帧视图', () => {
      const text = JSON.stringify({
        storyboard_config: {
          layout: '3x3_grid',
          aspect_ratio: '16:9',
          style: 'modern_thriller',
          visual_anchor: {
            character: '黑色短发，深灰风衣，左眉浅疤',
            environment: '废弃地铁站台，冷色调',
            lighting: '戏剧侧光',
            mood: '紧张',
          },
        },
        shots: [
          { shot_number: '分镜1', type: 'ELS', type_cn: '大远景', description: '环境全貌', angle: 'Eye level', focus: '建立环境' },
          { shot_number: '分镜2', type: 'LS', type_cn: '远景', description: '动作展示', angle: 'Eye level', focus: '动作展示' },
          { shot_number: '分镜3', type: 'MLS', type_cn: '中远景', description: '人物关系', angle: 'Slight low angle', focus: '人物关系' },
          { shot_number: '分镜4', type: 'MS', type_cn: '中景', description: '肢体语言', angle: 'Eye level', focus: '肢体语言' },
          { shot_number: '分镜5', type: 'MCU', type_cn: '中近景', description: '情绪表达', angle: 'Slight high angle', focus: '情绪表达' },
          { shot_number: '分镜6', type: 'CU', type_cn: '近景', description: '眼神细节', angle: 'Straight on', focus: '眼神细节' },
          { shot_number: '分镜7', type: 'ECU', type_cn: '特写', description: '关键道具', angle: 'Macro', focus: '关键道具' },
          { shot_number: '分镜8', type: 'Low Angle', type_cn: '仰拍', description: '权力关系', angle: 'Extreme low angle', focus: '权力关系' },
          { shot_number: '分镜9', type: 'High Angle', type_cn: '俯拍', description: '上帝视角', angle: 'Top-down', focus: '上帝视角' },
        ],
        technical_requirements: {
          consistency: 'ABSOLUTE: Same character face, same costume, same lighting across all 9 panels',
          composition: "Label '分镜X' top-left corner, no timecode, cinematic 2.39:1 ratio",
          quality: 'Photorealistic, 8K, film grain',
        },
      });

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.keyframes).toHaveLength(9);
      expect(parsed.filledKeyframeCount).toBe(9);
      expect(parsed.keyframes[0].zh).toContain('ELS');
      expect(parsed.keyframes[8].zh).toContain('High Angle');
      expect(parsed.avoid).toBeUndefined();
    });

    it('V2 quality 中包含 avoid=... 时应提取负面词', () => {
      const text = JSON.stringify({
        storyboard_config: {
          layout: '3x3_grid',
          aspect_ratio: '16:9',
          style: 'modern_thriller',
          visual_anchor: {
            character: '主角',
            environment: '环境',
            lighting: '灯光',
            mood: '紧张',
          },
        },
        shots: Array.from({ length: 9 }).map((_, i) => ({
          shot_number: `分镜${i + 1}`,
          type: ['ELS', 'LS', 'MLS', 'MS', 'MCU', 'CU', 'ECU', 'Low Angle', 'High Angle'][i],
          type_cn: 'x',
          description: `描述${i + 1}`,
          angle: 'Eye level',
          focus: '测试',
        })),
        technical_requirements: {
          consistency: 'ABSOLUTE',
          composition: 'Label',
          quality: 'Photorealistic, 8K, film grain, avoid=no text; no watermark',
        },
      });

      const parsed = parseKeyframePromptText(text);
      expect(parsed.avoid?.zh).toBe('no text; no watermark');
      expect(parsed.avoid?.en).toBe('no text; no watermark');
    });
  });

  describe('parseSceneAnchorText', () => {
    it('应解析场景锚点的中英与 LOCK/AVOID', () => {
      const text = [
        'SCENE_ANCHOR_ZH: 地铁车厢内部，冷白LED灯光，钢灰座椅，长条车窗',
        'SCENE_ANCHOR_EN: interior of a subway car, cold white LED lighting, steel-gray seats, elongated windows',
        'LOCK_ZH: 1) 冷白LED灯管; 2) 长条车窗; 3) 钢灰塑料座椅',
        'LOCK_EN: 1) cold white LED tubes; 2) elongated windows; 3) steel-gray plastic seats',
        'AVOID_ZH: 不要人物，不要文字，不要水印',
        'AVOID_EN: no people, no text, no watermark',
      ].join('\n');

      const parsed = parseSceneAnchorText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.sceneAnchor.zh).toContain('地铁车厢');
      expect(parsed.sceneAnchor.en).toContain('subway');
      expect(parsed.lock?.zh).toContain('长条车窗');
      expect(parsed.avoid?.en).toContain('no watermark');
    });

    it('无标签内容应返回 rawUnlabeled', () => {
      const parsed = parseSceneAnchorText('旧版场景描述一段话');
      expect(parsed.isStructured).toBe(false);
      expect(parsed.rawUnlabeled).toContain('旧版');
    });

    it('应支持中文冒号（SCENE_ANCHOR_ZH：）', () => {
      const text = [
        'SCENE_ANCHOR_ZH：地铁车厢内部',
        'SCENE_ANCHOR_EN：interior of a subway car',
        'LOCK_ZH：1) 灯管; 2) 车窗',
        'LOCK_EN：1) light tubes; 2) windows',
      ].join('\n');

      const parsed = parseSceneAnchorText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.sceneAnchor.zh).toContain('地铁车厢');
      expect(parsed.sceneAnchor.en).toContain('subway');
      expect(parsed.lock?.zh).toContain('车窗');
    });
  });

  describe('parseMotionPromptText', () => {
    it('应解析短版/分拍/约束的中英双语', () => {
      const text = [
        'MOTION_SHORT_ZH: 从KF0到KF2，女孩姿态从靠门到扶杆，视线变化',
        'MOTION_SHORT_EN: from KF0 to KF2, the girl shifts from by the door to holding the handrail, gaze changes',
        'MOTION_BEATS_ZH: 0-1s: ...; 1-2s: ...; 2-3s: ...',
        'MOTION_BEATS_EN: 0-1s: ...; 1-2s: ...; 2-3s: ...',
        'CONSTRAINTS_ZH: 保持背景不变，不要文字水印',
        'CONSTRAINTS_EN: keep background unchanged, no text, no watermark',
      ].join('\n');

      const parsed = parseMotionPromptText(text);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.motionShort.zh).toContain('女孩');
      expect(parsed.motionBeats.en).toContain('0-1s');
      expect(parsed.constraints.en).toContain('keep background unchanged');
    });

    it('无标签内容应返回 rawUnlabeled', () => {
      const parsed = parseMotionPromptText('man rushes, knocks over jar');
      expect(parsed.isStructured).toBe(false);
      expect(parsed.rawUnlabeled).toContain('rushes');
    });
  });
});
