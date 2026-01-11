import { GENERATED_IMAGE_KEYFRAMES } from '@aixsss/shared';

export type PromptLocale = 'zh' | 'en';

export interface LocaleText {
  zh?: string;
  en?: string;
}

export interface ParsedKeyframePrompts {
  /** 关键帧提示词（默认 KF0-KF8 共9帧；按顺序） */
  keyframes: LocaleText[];
  /** 对应 keyframes 的 key 列表（默认 KF0-KF8；按顺序） */
  keyframeKeys: string[];
  /** 有内容的关键帧数量（zh 或 en 任一非空即计入） */
  filledKeyframeCount: number;
  /** 负面/避免项 */
  avoid?: LocaleText;
  /** 摄像机/镜头信息 */
  camera?: { type?: string; angle?: string; aspectRatio?: string };
  /** 无法识别的剩余文本 */
  rawUnlabeled?: string;
  /** 是否识别到结构化标签/JSON */
  isStructured: boolean;
  /** 是否为 JSON 格式 */
  isJson?: boolean;
  /** 原始 JSON 对象（用于拼接） */
  rawJson?: KeyframeJsonData;
}

export interface ParsedSceneAnchorText {
  sceneAnchor: LocaleText;
  lock?: LocaleText;
  avoid?: LocaleText;
  /** 位置信息 */
  location?: { type?: string; name?: string; details?: string };
  /** 光照信息 */
  lighting?: { type?: string; direction?: string; color?: string; intensity?: string };
  /** 氛围信息 */
  atmosphere?: { mood?: string; weather?: string; timeOfDay?: string };
  /** 锚点列表 */
  anchors?: LocaleText;
  rawUnlabeled?: string;
  isStructured: boolean;
  /** 是否为 JSON 格式 */
  isJson?: boolean;
  /** 原始 JSON 对象（用于拼接） */
  rawJson?: SceneAnchorJsonData;
}

export interface ParsedMotionPromptText {
  motionShort: LocaleText;
  motionBeats: LocaleText;
  constraints: LocaleText;
  /** 变化描述 */
  changes?: {
    subject?: LocaleText;
    camera?: LocaleText;
    environment?: LocaleText;
  };
  rawUnlabeled?: string;
  isStructured: boolean;
  /** 是否为 JSON 格式 */
  isJson?: boolean;
  /** 原始 JSON 对象（用于拼接） */
  rawJson?: MotionJsonData;
}

// ==================== JSON 数据结构定义 ====================

export interface SceneAnchorJsonData {
  scene?: { zh?: string; en?: string };
  location?: { type?: string; name?: string; details?: string };
  lighting?: { type?: string; direction?: string; color?: string; intensity?: string };
  atmosphere?: { mood?: string; weather?: string; timeOfDay?: string };
  anchors?: { zh?: string[]; en?: string[] };
  avoid?: { zh?: string; en?: string };
}

export interface KeyframeSubject {
  name?: string;
  position?: string;
  pose?: string;
  action?: string;
  expression?: string;
  gaze?: string;
  interaction?: string;
}

export interface KeyframeLocaleData {
  subjects?: KeyframeSubject[];
  usedAnchors?: string[];
  composition?: string;
  bubbleSpace?: string;
}

export interface KeyframeJsonData {
  camera?: { type?: string; angle?: string; aspectRatio?: string };
  keyframes?: Record<string, { zh?: KeyframeLocaleData; en?: KeyframeLocaleData } | undefined>;
  avoid?: { zh?: string; en?: string };
}

export interface MotionJsonData {
  motion?: {
    short?: { zh?: string; en?: string };
    beats?: {
      zh?: { '0-1s'?: string; '1-2s'?: string; '2-3s'?: string };
      en?: { '0-1s'?: string; '1-2s'?: string; '2-3s'?: string };
    };
  };
  changes?: {
    subject?: { zh?: string[]; en?: string[] };
    camera?: { zh?: string[]; en?: string[] };
    environment?: { zh?: string[]; en?: string[] };
  };
  constraints?: { zh?: string; en?: string };
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ==================== JSON 解析工具 ====================

/**
 * 尝试解析 JSON，支持提取被代码块包裹的 JSON
 */
function tryParseJson<T>(text: string): { valid: boolean; data?: T } {
  const content = text?.trim() ?? '';
  if (!content) return { valid: false };

  // 尝试提取被 ```json ... ``` 或 ``` ... ``` 包裹的内容
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;

  try {
    const parsed = JSON.parse(jsonStr) as T;
    return { valid: true, data: parsed };
  } catch {
    return { valid: false };
  }
}

// ==================== JSON 拼接函数 ====================

/**
 * 将场景锚点 JSON 拼接为完整的提示词字符串
 */
export function buildSceneAnchorPromptFromJson(
  json: SceneAnchorJsonData,
  locale: PromptLocale,
): string {
  const parts: string[] = [];

  // 场景描述
  const scene = json.scene?.[locale];
  if (scene) parts.push(scene);

  // 位置信息
  if (json.location) {
    const loc = json.location;
    const locParts: string[] = [];
    if (loc.type) locParts.push(locale === 'zh' ? `${loc.type}` : loc.type);
    if (loc.name) locParts.push(loc.name);
    if (loc.details) locParts.push(loc.details);
    if (locParts.length) parts.push(locParts.join(', '));
  }

  // 光照信息
  if (json.lighting) {
    const light = json.lighting;
    const lightParts: string[] = [];
    if (light.type) lightParts.push(light.type);
    if (light.direction) lightParts.push(light.direction);
    if (light.color) lightParts.push(light.color);
    if (light.intensity) lightParts.push(light.intensity);
    if (lightParts.length) {
      parts.push(
        locale === 'zh' ? `光照: ${lightParts.join(', ')}` : `Lighting: ${lightParts.join(', ')}`,
      );
    }
  }

  // 氛围信息
  if (json.atmosphere) {
    const atm = json.atmosphere;
    const atmParts: string[] = [];
    if (atm.mood) atmParts.push(atm.mood);
    if (atm.weather && atm.weather !== '不适用') atmParts.push(atm.weather);
    if (atm.timeOfDay) atmParts.push(atm.timeOfDay);
    if (atmParts.length) {
      parts.push(
        locale === 'zh' ? `氛围: ${atmParts.join(', ')}` : `Atmosphere: ${atmParts.join(', ')}`,
      );
    }
  }

  // 锚点列表
  const anchors = json.anchors?.[locale];
  if (anchors && anchors.length) {
    parts.push(
      locale === 'zh' ? `场景锚点: ${anchors.join(', ')}` : `Scene anchors: ${anchors.join(', ')}`,
    );
  }

  // 避免项
  const avoid = json.avoid?.[locale];
  if (avoid) {
    parts.push(avoid);
  }

  return parts.join('\n');
}

/**
 * 将单个关键帧 JSON 数据拼接为完整的提示词字符串
 */
export function buildKeyframePromptFromJson(
  kfData: KeyframeLocaleData | undefined,
  camera: KeyframeJsonData['camera'],
  locale: PromptLocale,
): string {
  if (!kfData) return '';

  const parts: string[] = [];

  // 镜头信息
  if (camera) {
    const camParts: string[] = [];
    if (camera.type) camParts.push(camera.type);
    if (camera.angle) camParts.push(camera.angle);
    if (camera.aspectRatio) camParts.push(camera.aspectRatio);
    if (camParts.length) {
      parts.push(
        locale === 'zh' ? `镜头: ${camParts.join(', ')}` : `Camera: ${camParts.join(', ')}`,
      );
    }
  }

  // 主体描述
  if (kfData.subjects && kfData.subjects.length) {
    for (const subject of kfData.subjects) {
      const subjectParts: string[] = [];
      if (subject.name) subjectParts.push(subject.name);
      if (subject.position) subjectParts.push(subject.position);
      if (subject.pose) subjectParts.push(subject.pose);
      if (subject.action) subjectParts.push(subject.action);
      if (subject.expression) subjectParts.push(subject.expression);
      if (subject.gaze) subjectParts.push(subject.gaze);
      if (subject.interaction) subjectParts.push(subject.interaction);
      if (subjectParts.length) parts.push(subjectParts.join(', '));
    }
  }

  // 使用的锚点
  if (kfData.usedAnchors && kfData.usedAnchors.length) {
    parts.push(
      locale === 'zh'
        ? `场景锚点: ${kfData.usedAnchors.join(', ')}`
        : `Scene anchors: ${kfData.usedAnchors.join(', ')}`,
    );
  }

  // 构图
  if (kfData.composition) {
    parts.push(
      locale === 'zh' ? `构图: ${kfData.composition}` : `Composition: ${kfData.composition}`,
    );
  }

  // 气泡留白
  if (kfData.bubbleSpace) {
    parts.push(
      locale === 'zh' ? `气泡留白: ${kfData.bubbleSpace}` : `Bubble space: ${kfData.bubbleSpace}`,
    );
  }

  return parts.join(', ');
}

/**
 * 将运动提示词 JSON 拼接为完整的提示词字符串
 */
export function buildMotionPromptFromJson(json: MotionJsonData, locale: PromptLocale): string {
  const parts: string[] = [];

  // 简短描述
  const motionShort = json.motion?.short?.[locale];
  if (motionShort) parts.push(motionShort);

  // 时间节拍
  const beats = json.motion?.beats?.[locale];
  if (beats) {
    const beatParts: string[] = [];
    if (beats['0-1s']) beatParts.push(`0-1s: ${beats['0-1s']}`);
    if (beats['1-2s']) beatParts.push(`1-2s: ${beats['1-2s']}`);
    if (beats['2-3s']) beatParts.push(`2-3s: ${beats['2-3s']}`);
    if (beatParts.length) parts.push(beatParts.join('; '));
  }

  // 变化描述
  if (json.changes) {
    const changeLines: string[] = [];

    const subjectChanges = json.changes.subject?.[locale];
    if (subjectChanges && subjectChanges.length) {
      changeLines.push(
        locale === 'zh'
          ? `主体变化: ${subjectChanges.join(', ')}`
          : `Subject changes: ${subjectChanges.join(', ')}`,
      );
    }

    const cameraChanges = json.changes.camera?.[locale];
    if (cameraChanges && cameraChanges.length) {
      changeLines.push(
        locale === 'zh'
          ? `镜头变化: ${cameraChanges.join(', ')}`
          : `Camera changes: ${cameraChanges.join(', ')}`,
      );
    }

    const envChanges = json.changes.environment?.[locale];
    if (envChanges && envChanges.length) {
      changeLines.push(
        locale === 'zh'
          ? `环境变化: ${envChanges.join(', ')}`
          : `Environment changes: ${envChanges.join(', ')}`,
      );
    }

    if (changeLines.length) parts.push(changeLines.join('\n'));
  }

  // 约束条件
  const constraints = json.constraints?.[locale];
  if (constraints) {
    parts.push(locale === 'zh' ? `约束: ${constraints}` : `Constraints: ${constraints}`);
  }

  return parts.join('\n');
}

function parseLabeledBlocks(
  text: string,
  allowedLabels: Set<string>,
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
  const keyframeKeys = [...GENERATED_IMAGE_KEYFRAMES];
  const emptyKeyframes: LocaleText[] = keyframeKeys.map(() => ({}));

  if (!text || !text.trim()) {
    return {
      keyframes: emptyKeyframes,
      keyframeKeys,
      filledKeyframeCount: 0,
      isStructured: false,
    };
  }

  // 尝试解析 JSON 格式
  const jsonResult = tryParseJson<KeyframeJsonData>(text);
  if (jsonResult.valid && jsonResult.data) {
    const json = jsonResult.data;
    const kfs = json.keyframes || {};

    // 将 JSON 结构转换为拼接后的字符串
    const buildKfText = (kfKey: string): LocaleText => {
      const kf = kfs[kfKey] as { zh?: KeyframeLocaleData; en?: KeyframeLocaleData } | undefined;
      return {
        zh: buildKeyframePromptFromJson(kf?.zh, json.camera, 'zh') || undefined,
        en: buildKeyframePromptFromJson(kf?.en, json.camera, 'en') || undefined,
      };
    };

    const keyframes = keyframeKeys.map((kfKey) => buildKfText(kfKey));
    const filledKeyframeCount = keyframes.filter((kf) =>
      Boolean(kf.zh?.trim() || kf.en?.trim()),
    ).length;

    return {
      keyframes,
      keyframeKeys,
      filledKeyframeCount,
      avoid: json.avoid,
      camera: json.camera,
      isStructured: true,
      isJson: true,
      rawJson: json,
    };
  }

  // 回退到旧的行标签格式解析
  const allowedLabels = new Set<string>([
    ...keyframeKeys.flatMap((kf) => [`${kf}_ZH`, `${kf}_EN`]),
    'AVOID_ZH',
    'AVOID_EN',
  ]);

  const blocks = parseLabeledBlocks(text, allowedLabels);
  const hasAnyLabel = Object.keys(blocks).some((k) => k !== '__unlabeled');

  const get = (label: string): string | undefined => {
    const value = blocks[label.toUpperCase()];
    return value && value.trim() ? value.trim() : undefined;
  };

  const keyframes: LocaleText[] = keyframeKeys.map((kfKey) => ({
    zh: get(`${kfKey}_ZH`),
    en: get(`${kfKey}_EN`),
  }));

  const filledKeyframeCount = keyframes.filter((kf) =>
    Boolean(kf.zh?.trim() || kf.en?.trim()),
  ).length;

  const avoid: LocaleText | undefined =
    get('AVOID_ZH') || get('AVOID_EN') ? { zh: get('AVOID_ZH'), en: get('AVOID_EN') } : undefined;

  return {
    keyframes,
    keyframeKeys,
    filledKeyframeCount,
    avoid,
    rawUnlabeled: blocks.__unlabeled,
    isStructured: hasAnyLabel,
    isJson: false,
  };
}

export function parseSceneAnchorText(text: string): ParsedSceneAnchorText {
  if (!text || !text.trim()) {
    return { sceneAnchor: {}, isStructured: false };
  }

  // 尝试解析 JSON 格式
  const jsonResult = tryParseJson<SceneAnchorJsonData>(text);
  if (jsonResult.valid && jsonResult.data) {
    const json = jsonResult.data;

    // 将 JSON 结构转换为拼接后的完整提示词
    const sceneAnchor: LocaleText = {
      zh: buildSceneAnchorPromptFromJson(json, 'zh') || json.scene?.zh,
      en: buildSceneAnchorPromptFromJson(json, 'en') || json.scene?.en,
    };

    // 锚点列表转为字符串
    const lock: LocaleText | undefined = json.anchors
      ? {
          zh: json.anchors.zh?.join(', '),
          en: json.anchors.en?.join(', '),
        }
      : undefined;

    return {
      sceneAnchor,
      lock,
      avoid: json.avoid,
      location: json.location,
      lighting: json.lighting,
      atmosphere: json.atmosphere,
      anchors: lock,
      isStructured: true,
      isJson: true,
      rawJson: json,
    };
  }

  // 回退到旧的行标签格式解析
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
    get('LOCK_ZH') || get('LOCK_EN') ? { zh: get('LOCK_ZH'), en: get('LOCK_EN') } : undefined;

  const avoid: LocaleText | undefined =
    get('AVOID_ZH') || get('AVOID_EN') ? { zh: get('AVOID_ZH'), en: get('AVOID_EN') } : undefined;

  return {
    sceneAnchor,
    lock,
    avoid,
    rawUnlabeled: blocks.__unlabeled,
    isStructured: hasAnyLabel,
    isJson: false,
  };
}

export function parseMotionPromptText(text: string): ParsedMotionPromptText {
  if (!text || !text.trim()) {
    return { motionShort: {}, motionBeats: {}, constraints: {}, isStructured: false };
  }

  // 尝试解析 JSON 格式
  const jsonResult = tryParseJson<MotionJsonData>(text);
  if (jsonResult.valid && jsonResult.data) {
    const json = jsonResult.data;

    // 将 beats 对象转换为字符串
    const formatBeats = (locale: PromptLocale): string | undefined => {
      const beats = json.motion?.beats?.[locale];
      if (!beats) return undefined;
      const parts: string[] = [];
      if (beats['0-1s']) parts.push(`0-1s: ${beats['0-1s']}`);
      if (beats['1-2s']) parts.push(`1-2s: ${beats['1-2s']}`);
      if (beats['2-3s']) parts.push(`2-3s: ${beats['2-3s']}`);
      return parts.length ? parts.join('; ') : undefined;
    };

    return {
      motionShort: json.motion?.short || {},
      motionBeats: {
        zh: formatBeats('zh'),
        en: formatBeats('en'),
      },
      constraints: json.constraints || {},
      changes: {
        subject: {
          zh: json.changes?.subject?.zh?.join(', '),
          en: json.changes?.subject?.en?.join(', '),
        },
        camera: {
          zh: json.changes?.camera?.zh?.join(', '),
          en: json.changes?.camera?.en?.join(', '),
        },
        environment: {
          zh: json.changes?.environment?.zh?.join(', '),
          en: json.changes?.environment?.en?.join(', '),
        },
      },
      isStructured: true,
      isJson: true,
      rawJson: json,
    };
  }

  // 回退到旧的行标签格式解析
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
    isJson: false,
  };
}
