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
      expect(parsed.keyframes).toHaveLength(3);
    });

    it('应解析 KF0/KF1/KF2 的中英双语', () => {
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
      expect(parsed.keyframes[0].zh).toContain('靠窗');
      expect(parsed.keyframes[0].en).toContain('window-side');
      expect(parsed.keyframes[2].zh).toContain('信封');
      expect(parsed.keyframes[2].en).toContain('envelope');
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
      expect(parsed.keyframes[0].zh).toContain('翻倒的画笔筒');
      expect(parsed.keyframes[0].en).toContain('overturned brush holder');
      expect(parsed.avoid?.zh).toContain('不要水印');
      expect(parsed.avoid?.en).toContain('no watermark');
    });

    it('大小写不敏感（kf0_zh/kf0_en 也可解析）', () => {
      const text = ['kf0_zh: 中文内容', 'kf0_en: English content'].join('\n');

      const parsed = parseKeyframePromptText(text);
      expect(parsed.isStructured).toBe(true);
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
