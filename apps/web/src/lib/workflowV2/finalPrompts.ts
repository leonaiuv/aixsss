import type { LocaleText, PromptLocale } from '@/lib/ai/promptParsers';
import {
  parseKeyframePromptText,
  parseMotionPromptText,
  parseSceneAnchorText,
  buildSceneAnchorPromptFromJson,
  buildKeyframePromptFromJson,
  buildMotionPromptFromJson,
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

/**
 * 构建场景锚点主体内容（用于复制）
 * 支持 JSON 和旧行标签格式
 */
function buildAnchorMain(scene: Scene, locale: PromptLocale): string {
  const parsed = parseSceneAnchorText(scene.sceneDescription || '');
  
  // 如果是 JSON 格式且有原始数据，使用拼接函数
  if (parsed.isJson && parsed.rawJson) {
    return buildSceneAnchorPromptFromJson(parsed.rawJson, locale);
  }
  
  // 旧格式：拼接 sceneAnchor + lock
  const anchor = pickLocale(parsed.sceneAnchor, locale);
  const lock = pickLocale(parsed.lock, locale);
  return joinBlocks([anchor, lock]);
}

/**
 * 构建场景锚点避免项
 */
function buildAnchorAvoid(scene: Scene, locale: PromptLocale): string {
  const parsed = parseSceneAnchorText(scene.sceneDescription || '');
  return pickLocale(parsed.avoid, locale);
}

/**
 * 构建关键帧避免项
 */
function buildKeyframeAvoid(scene: Scene, locale: PromptLocale): string {
  const parsed = parseKeyframePromptText(scene.shotPrompt || '');
  return pickLocale(parsed.avoid, locale);
}

/**
 * 构建单个关键帧提示词
 * 支持 JSON 和旧行标签格式
 */
function buildKeyframePrompt(scene: Scene, kfIndex: 0 | 1 | 2, locale: PromptLocale): string {
  const parsed = parseKeyframePromptText(scene.shotPrompt || '');
  
  // 如果是 JSON 格式且有原始数据，使用拼接函数
  if (parsed.isJson && parsed.rawJson) {
    const kfKey = ['KF0', 'KF1', 'KF2'][kfIndex] as 'KF0' | 'KF1' | 'KF2';
    const kfData = parsed.rawJson.keyframes?.[kfKey]?.[locale];
    return buildKeyframePromptFromJson(kfData, parsed.rawJson.camera, locale);
  }
  
  // 旧格式
  const kf = parsed.keyframes[kfIndex];
  return pickLocale(kf, locale);
}

/**
 * 构建运动提示词
 * 支持 JSON 和旧行标签格式
 */
function buildMotionPrompt(scene: Scene, locale: PromptLocale): string {
  const parsed = parseMotionPromptText(scene.motionPrompt || '');
  
  // 如果是 JSON 格式且有原始数据，使用拼接函数
  if (parsed.isJson && parsed.rawJson) {
    return buildMotionPromptFromJson(parsed.rawJson, locale);
  }
  
  // 旧格式
  const motionShort = pickLocale(parsed.motionShort, locale);
  const motionBeats = pickLocale(parsed.motionBeats, locale);
  const constraints = pickLocale(parsed.constraints, locale);
  return joinBlocks([motionShort, motionBeats, constraints]);
}

// ==================== 一键复制工具函数 ====================

/**
 * 构建完整的场景锚点复制文本（中文/英文分开）
 */
export function buildSceneAnchorCopyText(scene: Scene): { zh: string; en: string } {
  const parsed = parseSceneAnchorText(scene.sceneDescription || '');
  
  if (parsed.isJson && parsed.rawJson) {
    return {
      zh: buildSceneAnchorPromptFromJson(parsed.rawJson, 'zh'),
      en: buildSceneAnchorPromptFromJson(parsed.rawJson, 'en'),
    };
  }
  
  // 旧格式
  const buildText = (locale: PromptLocale): string => {
    const parts: string[] = [];
    if (parsed.sceneAnchor[locale]) parts.push(parsed.sceneAnchor[locale]!);
    if (parsed.lock?.[locale]) parts.push(parsed.lock[locale]!);
    return parts.join('\n\n');
  };
  
  return { zh: buildText('zh'), en: buildText('en') };
}

/**
 * 构建完整的关键帧提示词复制文本（单个关键帧）
 */
export function buildKeyframeCopyText(scene: Scene, kfIndex: 0 | 1 | 2): { zh: string; en: string } {
  const parsed = parseKeyframePromptText(scene.shotPrompt || '');
  
  if (parsed.isJson && parsed.rawJson) {
    const kfKey = ['KF0', 'KF1', 'KF2'][kfIndex] as 'KF0' | 'KF1' | 'KF2';
    return {
      zh: buildKeyframePromptFromJson(parsed.rawJson.keyframes?.[kfKey]?.zh, parsed.rawJson.camera, 'zh'),
      en: buildKeyframePromptFromJson(parsed.rawJson.keyframes?.[kfKey]?.en, parsed.rawJson.camera, 'en'),
    };
  }
  
  // 旧格式
  const kf = parsed.keyframes[kfIndex];
  return { zh: kf.zh || '', en: kf.en || '' };
}

/**
 * 构建完整的运动提示词复制文本
 */
export function buildMotionCopyText(scene: Scene): { zh: string; en: string } {
  const parsed = parseMotionPromptText(scene.motionPrompt || '');
  
  if (parsed.isJson && parsed.rawJson) {
    return {
      zh: buildMotionPromptFromJson(parsed.rawJson, 'zh'),
      en: buildMotionPromptFromJson(parsed.rawJson, 'en'),
    };
  }
  
  // 旧格式
  const buildText = (locale: PromptLocale): string => {
    const parts: string[] = [];
    if (parsed.motionShort[locale]) parts.push(parsed.motionShort[locale]!);
    if (parsed.motionBeats[locale]) parts.push(parsed.motionBeats[locale]!);
    if (parsed.constraints[locale]) parts.push(parsed.constraints[locale]!);
    return parts.join('\n\n');
  };
  
  return { zh: buildText('zh'), en: buildText('en') };
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
