export type PromptLocale = 'zh' | 'en';

export interface LocaleText {
  zh?: string;
  en?: string;
}

export interface ParsedKeyframePrompts {
  /** KF0/KF1/KF2（起/中/终） */
  keyframes: [LocaleText, LocaleText, LocaleText];
  /** 负面/避免项 */
  avoid?: LocaleText;
  /** 无法识别的剩余文本 */
  rawUnlabeled?: string;
  /** 是否识别到结构化标签 */
  isStructured: boolean;
}

export interface ParsedSceneAnchorText {
  sceneAnchor: LocaleText;
  lock?: LocaleText;
  avoid?: LocaleText;
  rawUnlabeled?: string;
  isStructured: boolean;
}

export interface ParsedMotionPromptText {
  motionShort: LocaleText;
  motionBeats: LocaleText;
  constraints: LocaleText;
  rawUnlabeled?: string;
  isStructured: boolean;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseLabeledBlocks(
  text: string,
  allowedLabels: Set<string>
): Record<string, string> & { __unlabeled?: string } {
  const blocks: Record<string, string[]> = {};
  const unlabeled: string[] = [];

  const lines = normalizeNewlines(text).split('\n');
  let currentLabel: string | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*[:：]\s*(.*)$/);
    if (match) {
      const label = match[1].toUpperCase();
      if (allowedLabels.has(label)) {
        currentLabel = label;
        blocks[currentLabel] = blocks[currentLabel] || [];
        blocks[currentLabel].push(match[2] ?? '');
        continue;
      }
    }

    if (currentLabel) {
      blocks[currentLabel].push(line);
    } else {
      unlabeled.push(line);
    }
  }

  const result: Record<string, string> & { __unlabeled?: string } = {};
  for (const [label, parts] of Object.entries(blocks)) {
    const value = parts.join('\n').trim();
    if (value) {
      result[label] = value;
    }
  }

  const extra = unlabeled.join('\n').trim();
  if (extra) {
    result.__unlabeled = extra;
  }

  return result;
}

export function parseKeyframePromptText(text: string): ParsedKeyframePrompts {
  const emptyKeyframes: [LocaleText, LocaleText, LocaleText] = [{}, {}, {}];

  if (!text || !text.trim()) {
    return { keyframes: emptyKeyframes, isStructured: false };
  }

  const allowedLabels = new Set<string>([
    'KF0_ZH',
    'KF0_EN',
    'KF1_ZH',
    'KF1_EN',
    'KF2_ZH',
    'KF2_EN',
    'AVOID_ZH',
    'AVOID_EN',
  ]);

  const blocks = parseLabeledBlocks(text, allowedLabels);
  const hasAnyLabel = Object.keys(blocks).some((k) => k !== '__unlabeled');

  const get = (label: string): string | undefined => {
    const value = blocks[label.toUpperCase()];
    return value && value.trim() ? value.trim() : undefined;
  };

  const keyframes: [LocaleText, LocaleText, LocaleText] = [
    { zh: get('KF0_ZH'), en: get('KF0_EN') },
    { zh: get('KF1_ZH'), en: get('KF1_EN') },
    { zh: get('KF2_ZH'), en: get('KF2_EN') },
  ];

  const avoid: LocaleText | undefined =
    get('AVOID_ZH') || get('AVOID_EN')
      ? { zh: get('AVOID_ZH'), en: get('AVOID_EN') }
      : undefined;

  return {
    keyframes,
    avoid,
    rawUnlabeled: blocks.__unlabeled,
    isStructured: hasAnyLabel,
  };
}

export function parseSceneAnchorText(text: string): ParsedSceneAnchorText {
  if (!text || !text.trim()) {
    return { sceneAnchor: {}, isStructured: false };
  }

  const allowedLabels = new Set<string>([
    'SCENE_ANCHOR_ZH',
    'SCENE_ANCHOR_EN',
    'LOCK_ZH',
    'LOCK_EN',
    'AVOID_ZH',
    'AVOID_EN',
  ]);

  const blocks = parseLabeledBlocks(text, allowedLabels);
  const hasAnyLabel = Object.keys(blocks).some((k) => k !== '__unlabeled');

  const get = (label: string): string | undefined => {
    const value = blocks[label.toUpperCase()];
    return value && value.trim() ? value.trim() : undefined;
  };

  const sceneAnchor: LocaleText = {
    zh: get('SCENE_ANCHOR_ZH'),
    en: get('SCENE_ANCHOR_EN'),
  };

  const lock: LocaleText | undefined =
    get('LOCK_ZH') || get('LOCK_EN')
      ? { zh: get('LOCK_ZH'), en: get('LOCK_EN') }
      : undefined;

  const avoid: LocaleText | undefined =
    get('AVOID_ZH') || get('AVOID_EN')
      ? { zh: get('AVOID_ZH'), en: get('AVOID_EN') }
      : undefined;

  return {
    sceneAnchor,
    lock,
    avoid,
    rawUnlabeled: blocks.__unlabeled,
    isStructured: hasAnyLabel,
  };
}

export function parseMotionPromptText(text: string): ParsedMotionPromptText {
  if (!text || !text.trim()) {
    return { motionShort: {}, motionBeats: {}, constraints: {}, isStructured: false };
  }

  const allowedLabels = new Set<string>([
    'MOTION_SHORT_ZH',
    'MOTION_SHORT_EN',
    'MOTION_BEATS_ZH',
    'MOTION_BEATS_EN',
    'CONSTRAINTS_ZH',
    'CONSTRAINTS_EN',
  ]);

  const blocks = parseLabeledBlocks(text, allowedLabels);
  const hasAnyLabel = Object.keys(blocks).some((k) => k !== '__unlabeled');

  const get = (label: string): string | undefined => {
    const value = blocks[label.toUpperCase()];
    return value && value.trim() ? value.trim() : undefined;
  };

  const motionShort: LocaleText = {
    zh: get('MOTION_SHORT_ZH'),
    en: get('MOTION_SHORT_EN'),
  };
  const motionBeats: LocaleText = {
    zh: get('MOTION_BEATS_ZH'),
    en: get('MOTION_BEATS_EN'),
  };
  const constraints: LocaleText = {
    zh: get('CONSTRAINTS_ZH'),
    en: get('CONSTRAINTS_EN'),
  };

  return {
    motionShort,
    motionBeats,
    constraints,
    rawUnlabeled: blocks.__unlabeled,
    isStructured: hasAnyLabel,
  };
}
