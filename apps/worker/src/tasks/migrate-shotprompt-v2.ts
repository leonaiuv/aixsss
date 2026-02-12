import { STORYBOARD_V2_SHOT_CN, STORYBOARD_V2_SHOT_ORDER } from '@aixsss/shared';

export const LEGACY_SHOT_ORDER = [...STORYBOARD_V2_SHOT_ORDER];

export type StoryboardPromptV2 = {
  storyboard_config: {
    layout: '3x3_grid';
    aspect_ratio: '16:9';
    style: string;
    visual_anchor: {
      character: string;
      environment: string;
      lighting: string;
      mood: string;
    };
  };
  shots: Array<{
    shot_number: string;
    type: (typeof STORYBOARD_V2_SHOT_ORDER)[number];
    type_cn: string;
    description: string;
    angle: string;
    focus: string;
  }>;
  technical_requirements: {
    consistency: string;
    composition: string;
    quality: string;
  };
};

type LegacyKeyframeLocaleBlock = {
  subjects?: Array<{
    name?: string;
    position?: string;
    pose?: string;
    action?: string;
    expression?: string;
    gaze?: string;
    interaction?: string;
  }>;
  usedAnchors?: string[];
  composition?: string;
  bubbleSpace?: string;
};

type LegacyShotPrompt = {
  camera?: { type?: string; angle?: string; aspectRatio?: string };
  keyframes?: Record<string, { zh?: LegacyKeyframeLocaleBlock; en?: LegacyKeyframeLocaleBlock } | undefined>;
  avoid?: { zh?: string; en?: string };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function defaultAngleByType(type: (typeof STORYBOARD_V2_SHOT_ORDER)[number]): string {
  switch (type) {
    case 'ELS':
    case 'LS':
    case 'MS':
      return 'Eye level';
    case 'MLS':
      return 'Slight low angle';
    case 'MCU':
      return 'Slight high angle';
    case 'CU':
      return 'Straight on';
    case 'ECU':
      return 'Macro';
    case 'Low Angle':
      return 'Extreme low angle';
    case 'High Angle':
      return 'Top-down';
    default:
      return 'Eye level';
  }
}

function focusByIndex(index: number): string {
  if (index <= 2) return '建立环境';
  if (index <= 5) return '人物情绪';
  return '戏剧张力';
}

function legacyBlockToDescription(block: LegacyKeyframeLocaleBlock | undefined): string {
  if (!block) return '画面内容保持连贯，光影与氛围一致。';
  const subjects = (block.subjects ?? [])
    .map((s) => [s.name, s.position, s.pose, s.action, s.expression, s.gaze, s.interaction].filter(Boolean).join('，'))
    .filter(Boolean)
    .join('；');
  const anchors = block.usedAnchors?.length ? `锚点：${block.usedAnchors.join('、')}` : '';
  const composition = block.composition ? `构图：${block.composition}` : '';
  return [subjects, anchors, composition, '光影与氛围保持一致。'].filter(Boolean).join(' ');
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isStoryboardPromptV2(value: unknown): value is StoryboardPromptV2 {
  const obj = asRecord(value);
  if (!obj) return false;
  if (!asRecord(obj.storyboard_config) || !Array.isArray(obj.shots) || !asRecord(obj.technical_requirements)) {
    return false;
  }
  if (obj.shots.length !== STORYBOARD_V2_SHOT_ORDER.length) return false;
  return obj.shots.every((shot, idx) => {
    const s = asRecord(shot);
    return Boolean(s && s.type === STORYBOARD_V2_SHOT_ORDER[idx] && typeof s.description === 'string');
  });
}

export function convertLegacyShotPromptToV2(text: string): StoryboardPromptV2 | null {
  const parsed = parseJson(text);
  if (!parsed) return null;

  if (isStoryboardPromptV2(parsed)) return parsed;

  const legacy = parsed as LegacyShotPrompt;
  const keyframes = legacy.keyframes;
  if (!keyframes || typeof keyframes !== 'object') return null;

  const shots = STORYBOARD_V2_SHOT_ORDER.map((type, idx) => {
    const key = `KF${idx}`;
    const frame = keyframes[key];
    const block = frame?.zh || frame?.en;
    return {
      shot_number: `分镜${idx + 1}`,
      type,
      type_cn: STORYBOARD_V2_SHOT_CN[type],
      description: legacyBlockToDescription(block),
      angle: legacy.camera?.angle || defaultAngleByType(type),
      focus: focusByIndex(idx),
    };
  });

  const firstBlock = keyframes.KF0?.zh || keyframes.KF0?.en;
  const character = (firstBlock?.subjects ?? [])
    .map((s) => [s.name, s.pose].filter(Boolean).join(':'))
    .filter(Boolean)
    .join('；');

  const anchorText = firstBlock?.usedAnchors?.length
    ? `场景锚点：${firstBlock.usedAnchors.join('、')}`
    : '环境与空间关系保持一致';

  return {
    storyboard_config: {
      layout: '3x3_grid',
      aspect_ratio: '16:9',
      style: 'modern_thriller',
      visual_anchor: {
        character: character || '主角外观与服装保持一致',
        environment: anchorText,
        lighting: '统一主光方向与色温，不跨镜头跳变',
        mood: '紧张',
      },
    },
    shots,
    technical_requirements: {
      consistency: 'ABSOLUTE: Same character face, same costume, same lighting across all 9 panels',
      composition: "Label '分镜X' top-left corner, no timecode, cinematic 2.39:1 ratio",
      quality: `Photorealistic, 8K, film grain${legacy.avoid?.zh ? `, avoid=${legacy.avoid.zh}` : ''}`,
    },
  };
}
