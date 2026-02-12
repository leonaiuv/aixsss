import {
  GENERATED_IMAGE_KEYFRAMES,
  STORYBOARD_V2_SHOT_CN,
  STORYBOARD_V2_SHOT_ORDER,
  type StoryboardV2ShotType,
} from '@aixsss/shared';
import {
  parseKeyframePromptText,
  type LocaleText,
  type StoryboardKeyframeJsonData,
  type StoryboardShotV2Data,
} from '@/lib/ai/promptParsers';

const DEFAULT_SHOT_ANGLES = [
  'Eye level',
  'Eye level',
  'Slight low angle',
  'Eye level',
  'Slight high angle',
  'Straight on',
  'Macro',
  'Extreme low angle',
  'Top-down',
] as const;

const DEFAULT_SHOT_FOCUS = [
  '建立环境',
  '动作展示',
  '人物关系',
  '肢体语言',
  '情绪表达',
  '眼神细节',
  '关键道具',
  '权力关系',
  '上帝视角',
] as const;

type MergeSingleKeyframePromptArgs = {
  existingPrompt: string;
  regeneratedPrompt: string;
  keyframeKey: string;
};

function isStoryboardV2Json(value: unknown): value is StoryboardKeyframeJsonData {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray((value as { shots?: unknown }).shots)
  );
}

function pickLocaleText(text: LocaleText | undefined): string | undefined {
  const zh = text?.zh?.trim();
  if (zh) return zh;
  const en = text?.en?.trim();
  if (en) return en;
  return undefined;
}

function toDefaultShot(index: number): StoryboardShotV2Data {
  const shotType = STORYBOARD_V2_SHOT_ORDER[index] as StoryboardV2ShotType;
  return {
    shot_number: `分镜${index + 1}`,
    type: shotType,
    type_cn: STORYBOARD_V2_SHOT_CN[shotType],
    description: '',
    angle: DEFAULT_SHOT_ANGLES[index],
    focus: DEFAULT_SHOT_FOCUS[index],
  };
}

function normalizeShot(
  index: number,
  shot: StoryboardShotV2Data | undefined,
): StoryboardShotV2Data {
  const base = toDefaultShot(index);
  return {
    shot_number: shot?.shot_number?.trim() || base.shot_number,
    type: base.type,
    type_cn: base.type_cn,
    description: shot?.description?.trim() || base.description,
    angle: shot?.angle?.trim() || base.angle,
    focus: shot?.focus?.trim() || base.focus,
  };
}

function shotFromLegacyLocale(index: number, text: LocaleText | undefined): StoryboardShotV2Data {
  return {
    ...toDefaultShot(index),
    description: pickLocaleText(text) || '',
  };
}

function cloneV2Container(v2: StoryboardKeyframeJsonData | undefined): {
  storyboard_config: NonNullable<StoryboardKeyframeJsonData['storyboard_config']>;
  technical_requirements: NonNullable<StoryboardKeyframeJsonData['technical_requirements']>;
} {
  return {
    storyboard_config: {
      layout: v2?.storyboard_config?.layout || '3x3_grid',
      aspect_ratio: v2?.storyboard_config?.aspect_ratio || '16:9',
      style: v2?.storyboard_config?.style || 'modern_thriller',
      visual_anchor: {
        character: v2?.storyboard_config?.visual_anchor?.character || '',
        environment: v2?.storyboard_config?.visual_anchor?.environment || '',
        lighting: v2?.storyboard_config?.visual_anchor?.lighting || '',
        mood: v2?.storyboard_config?.visual_anchor?.mood || '',
      },
    },
    technical_requirements: {
      consistency: v2?.technical_requirements?.consistency || '',
      composition: v2?.technical_requirements?.composition || '',
      quality: v2?.technical_requirements?.quality || '',
    },
  };
}

export function mergeSingleKeyframePrompt(args: MergeSingleKeyframePromptArgs): string {
  const { existingPrompt, regeneratedPrompt, keyframeKey } = args;
  const targetIndex = GENERATED_IMAGE_KEYFRAMES.indexOf(
    keyframeKey as (typeof GENERATED_IMAGE_KEYFRAMES)[number],
  );
  if (targetIndex < 0) {
    throw new Error(`Invalid keyframe key: ${keyframeKey}`);
  }

  const existingParsed = parseKeyframePromptText(existingPrompt || '');
  const regeneratedParsed = parseKeyframePromptText(regeneratedPrompt || '');

  const existingV2 = isStoryboardV2Json(existingParsed.rawJson)
    ? existingParsed.rawJson
    : undefined;
  const regeneratedV2 = isStoryboardV2Json(regeneratedParsed.rawJson)
    ? regeneratedParsed.rawJson
    : undefined;

  const targetShot =
    regeneratedV2?.shots?.[targetIndex] ||
    shotFromLegacyLocale(targetIndex, regeneratedParsed.keyframes[targetIndex]);
  const normalizedTargetShot = normalizeShot(targetIndex, targetShot);
  if (!normalizedTargetShot.description?.trim()) {
    throw new Error(`Regenerated prompt missing content for ${keyframeKey}`);
  }

  const baseContainer = cloneV2Container(existingV2 || regeneratedV2);
  const shots = STORYBOARD_V2_SHOT_ORDER.map((_, index) => {
    if (index === targetIndex) return normalizedTargetShot;

    const existingShot =
      existingV2?.shots?.[index] || shotFromLegacyLocale(index, existingParsed.keyframes[index]);
    return normalizeShot(index, existingShot);
  });

  return JSON.stringify(
    {
      storyboard_config: baseContainer.storyboard_config,
      shots,
      technical_requirements: baseContainer.technical_requirements,
    },
    null,
    2,
  );
}
