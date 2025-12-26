import type { LocaleText, PromptLocale } from '@/lib/ai/promptParsers';
import {
  parseKeyframePromptText,
  parseMotionPromptText,
  parseSceneAnchorText,
} from '@/lib/ai/promptParsers';
import type { Scene } from '@/types';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickLocale(text: LocaleText | undefined, locale: PromptLocale): string {
  return safeTrim(text?.[locale]);
}

function joinBlocks(blocks: Array<string | null | undefined>): string {
  const parts = blocks.map((b) => safeTrim(b)).filter(Boolean);
  return parts.join('\n\n');
}

function buildAnchorMain(scene: Scene, locale: PromptLocale): string {
  const parsed = parseSceneAnchorText(scene.sceneDescription || '');
  const anchor = pickLocale(parsed.sceneAnchor, locale);
  const lock = pickLocale(parsed.lock, locale);
  return joinBlocks([anchor, lock]);
}

function buildAnchorAvoid(scene: Scene, locale: PromptLocale): string {
  const parsed = parseSceneAnchorText(scene.sceneDescription || '');
  return pickLocale(parsed.avoid, locale);
}

function buildKeyframeAvoid(scene: Scene, locale: PromptLocale): string {
  const parsed = parseKeyframePromptText(scene.shotPrompt || '');
  return pickLocale(parsed.avoid, locale);
}

function buildKeyframePrompt(scene: Scene, kfIndex: 0 | 1 | 2, locale: PromptLocale): string {
  const parsed = parseKeyframePromptText(scene.shotPrompt || '');
  const kf = parsed.keyframes[kfIndex];
  return pickLocale(kf, locale);
}

function buildMotionPrompt(scene: Scene, locale: PromptLocale): string {
  const parsed = parseMotionPromptText(scene.motionPrompt || '');
  const motionShort = pickLocale(parsed.motionShort, locale);
  const motionBeats = pickLocale(parsed.motionBeats, locale);
  const constraints = pickLocale(parsed.constraints, locale);
  return joinBlocks([motionShort, motionBeats, constraints]);
}

export interface FinalPromptPack {
  imagePrompt: {
    zh: [string, string, string];
    en: [string, string, string];
  };
  negativePrompt: {
    zh: string;
    en: string;
  };
  i2vPrompt: {
    zh: string;
    en: string;
  };
}

export function buildFinalPromptPack(scene: Scene, styleFullPrompt: string): FinalPromptPack {
  const style = safeTrim(styleFullPrompt);

  const buildImage = (locale: PromptLocale): [string, string, string] => {
    const anchor = buildAnchorMain(scene, locale);
    return ([0, 1, 2] as const).map((idx) =>
      joinBlocks([style, anchor, buildKeyframePrompt(scene, idx, locale)]),
    ) as [string, string, string];
  };

  const buildNegative = (locale: PromptLocale): string =>
    joinBlocks([buildAnchorAvoid(scene, locale), buildKeyframeAvoid(scene, locale)]);

  const buildI2v = (locale: PromptLocale): string =>
    joinBlocks([style, buildAnchorMain(scene, locale), buildMotionPrompt(scene, locale)]);

  return {
    imagePrompt: {
      zh: buildImage('zh'),
      en: buildImage('en'),
    },
    negativePrompt: {
      zh: buildNegative('zh'),
      en: buildNegative('en'),
    },
    i2vPrompt: {
      zh: buildI2v('zh'),
      en: buildI2v('en'),
    },
  };
}
