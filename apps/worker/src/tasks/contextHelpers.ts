/**
 * 上下文辅助函数
 * 用于从项目/剧集/分镜数据中提取和构建传递给 AI 的上下文信息
 */

import type { Prisma } from '@prisma/client';

// ============= 类型定义 =============

export interface CoreExpressionData {
  theme?: string;
  emotionalArc?: string[];
  visualMotifs?: string[];
  coreConflict?: string;
  payoff?: Array<{ type: string; content: string }>;
  endingBeat?: string;
  nextHook?: string;
}

export interface NarrativeBeat {
  beatName?: string;
  surfaceEvent?: string;
  emotionalTone?: string;
  location?: string;
  characters?: string[];
  visualHook?: string;
  estimatedScenes?: number;
}

export interface NarrativeAct {
  act?: number;
  actName?: string;
  beats?: NarrativeBeat[];
}

export interface NarrativeCausalChainData {
  beatFlow?: {
    actMode?: 'three_act' | 'five_act';
    acts?: NarrativeAct[];
  };
  infoVisibilityLayers?: Array<{
    layerName?: string;
    roles?: string[];
    infoBoundary?: string;
    blindSpot?: string;
    motivation?: string;
  }>;
  plotLines?: Array<{
    lineType?: 'main' | 'sub1' | 'sub2' | 'sub3';
    driver?: string;
    statedGoal?: string;
    trueGoal?: string;
  }>;
}

export interface EpisodeContextData {
  order: number;
  title: string;
  coreExpression?: CoreExpressionData | null;
}

export interface NarrativeContextData {
  currentBeatPosition: '起' | '承' | '转' | '合';
  emotionalTone?: string;
  currentBeatName?: string;
  infoToReveal?: string;
  infoToHide?: string;
}

export interface CharacterVisualData {
  id: string;
  name: string;
  visualDescription?: string | null;
  personality?: string | null;
  avatar?: string | null;
  appearances?: unknown;
}

// ============= 情感曲线计算 =============

/**
 * 根据分镜位置计算情感曲线位置（起承转合）
 */
export function calculateEmotionalPosition(
  sceneOrder: number,
  totalScenes: number
): '起' | '承' | '转' | '合' {
  if (totalScenes <= 0) return '起';
  const ratio = sceneOrder / totalScenes;
  if (ratio <= 0.25) return '起';
  if (ratio <= 0.5) return '承';
  if (ratio <= 0.75) return '转';
  return '合';
}

/**
 * 根据情感曲线位置获取对应的情绪基调描述
 */
export function getEmotionalToneByPosition(
  position: '起' | '承' | '转' | '合',
  emotionalArc?: string[]
): string | undefined {
  if (!emotionalArc || emotionalArc.length !== 4) return undefined;
  const index = { 起: 0, 承: 1, 转: 2, 合: 3 }[position];
  return emotionalArc[index];
}

// ============= 关键帧提取 =============

/**
 * 从 shotPrompt JSON 中提取 KF8（最后一帧）
 */
export function extractKF8FromShotPrompt(shotPrompt: string | null | undefined): string | undefined {
  if (!shotPrompt?.trim()) return undefined;
  try {
    const parsed = JSON.parse(shotPrompt);
    if (Array.isArray(parsed?.shots) && parsed.shots[8]) {
      return JSON.stringify(parsed.shots[8], null, 2);
    }
    const kf8 = parsed.keyframes?.KF8 || parsed.KF8;
    return kf8 ? JSON.stringify(kf8, null, 2) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 从 shotPrompt JSON 中提取 KF0（第一帧）
 */
export function extractKF0FromShotPrompt(shotPrompt: string | null | undefined): string | undefined {
  if (!shotPrompt?.trim()) return undefined;
  try {
    const parsed = JSON.parse(shotPrompt);
    if (Array.isArray(parsed?.shots) && parsed.shots[0]) {
      return JSON.stringify(parsed.shots[0], null, 2);
    }
    const kf0 = parsed.keyframes?.KF0 || parsed.KF0;
    return kf0 ? JSON.stringify(kf0, null, 2) : undefined;
  } catch {
    return undefined;
  }
}

// ============= 叙事上下文构建 =============

/**
 * 从 contextCache 中提取叙事因果链数据
 */
export function extractNarrativeCausalChain(
  contextCache: Prisma.JsonValue | null | undefined
): NarrativeCausalChainData | null {
  if (!contextCache || typeof contextCache !== 'object') return null;
  const cache = contextCache as Record<string, unknown>;
  const chain = cache.narrativeCausalChain;
  if (!chain || typeof chain !== 'object') return null;
  return chain as NarrativeCausalChainData;
}

/**
 * 根据分镜位置计算当前所属的节拍信息
 */
export function buildNarrativeContext(
  contextCache: Prisma.JsonValue | null | undefined,
  sceneOrder: number,
  totalScenes: number
): NarrativeContextData {
  const position = calculateEmotionalPosition(sceneOrder, totalScenes);
  const result: NarrativeContextData = { currentBeatPosition: position };

  const chain = extractNarrativeCausalChain(contextCache);
  if (!chain?.beatFlow?.acts) return result;

  // 根据 position 找到对应的 act
  const acts = chain.beatFlow.acts;
  const actIndex = { 起: 0, 承: 1, 转: 2, 合: 3 }[position];

  // 三幕结构映射：起->Act1, 承转->Act2, 合->Act3
  // 五幕结构保持原样
  let targetAct: NarrativeAct | undefined;
  if (chain.beatFlow.actMode === 'three_act') {
    if (actIndex === 0) targetAct = acts[0];
    else if (actIndex === 1 || actIndex === 2) targetAct = acts[1];
    else targetAct = acts[2];
  } else {
    targetAct = acts[Math.min(actIndex, acts.length - 1)];
  }

  if (targetAct?.beats && targetAct.beats.length > 0) {
    // 取该幕的中间 beat 作为代表
    const beatIndex = Math.floor(targetAct.beats.length / 2);
    const beat = targetAct.beats[beatIndex];
    if (beat) {
      result.currentBeatName = beat.beatName;
      result.emotionalTone = beat.emotionalTone;
    }
  }

  // 从 infoVisibilityLayers 提取信息边界
  const infoLayers = chain.infoVisibilityLayers;
  if (infoLayers && infoLayers.length > 0) {
    const layer = infoLayers[0]; // 取第一层作为主要参考
    result.infoToReveal = layer?.infoBoundary;
    result.infoToHide = layer?.blindSpot;
  }

  return result;
}

// ============= 角色上下文构建 =============

/**
 * 构建角色视觉上下文（用于关键帧生成）
 */
export function buildCharacterVisualContext(characters: CharacterVisualData[]): string {
  if (!characters || characters.length === 0) return '- 无指定角色';

  return characters
    .map((c) => {
      const parts = [`- ${c.name}`];
      if (c.visualDescription?.trim()) {
        parts.push(`外貌: ${c.visualDescription.trim()}`);
      }
      if (c.personality?.trim()) {
        parts.push(`性格: ${c.personality.trim()}`);
      }
      return parts.join(' | ');
    })
    .join('\n');
}

/**
 * 构建角色名称列表（简化版，用于提及）
 */
export function buildCharacterNameList(characters: CharacterVisualData[]): string {
  if (!characters || characters.length === 0) return '-';
  return characters.map((c) => c.name).join('、');
}

// ============= 核心表达解析 =============

/**
 * 从 episode.coreExpression 解析核心表达数据
 */
export function parseCoreExpression(
  coreExpression: Prisma.JsonValue | null | undefined
): CoreExpressionData | null {
  if (!coreExpression || typeof coreExpression !== 'object') return null;
  return coreExpression as CoreExpressionData;
}

/**
 * 构建核心表达上下文字符串（用于提示词）
 */
export function buildCoreExpressionContext(
  coreExpression: CoreExpressionData | null,
  currentPosition?: '起' | '承' | '转' | '合'
): string {
  if (!coreExpression) return '';

  const parts: string[] = [];

  if (coreExpression.theme) {
    parts.push(`主题: ${coreExpression.theme}`);
  }

  if (coreExpression.emotionalArc && coreExpression.emotionalArc.length === 4) {
    const positionLabels = ['起', '承', '转', '合'];
    const arcDesc = coreExpression.emotionalArc
      .map((tone, i) => `${positionLabels[i]}:${tone}`)
      .join(' → ');
    parts.push(`情感曲线: ${arcDesc}`);

    if (currentPosition) {
      const currentTone = getEmotionalToneByPosition(currentPosition, coreExpression.emotionalArc);
      if (currentTone) {
        parts.push(`当前阶段[${currentPosition}]情绪: ${currentTone}`);
      }
    }
  }

  if (coreExpression.visualMotifs && coreExpression.visualMotifs.length > 0) {
    parts.push(`视觉母题: ${coreExpression.visualMotifs.join('、')}`);
  }

  if (coreExpression.coreConflict) {
    parts.push(`核心冲突: ${coreExpression.coreConflict}`);
  }

  return parts.join('\n');
}

// ============= 剧集上下文构建 =============

/**
 * 构建剧集上下文字符串
 */
export function buildEpisodeContext(episode: EpisodeContextData | null): string {
  if (!episode) return '';

  const parts: string[] = [];
  parts.push(`第 ${episode.order} 集: ${episode.title}`);

  const coreExpr = parseCoreExpression(episode.coreExpression as Prisma.JsonValue);
  if (coreExpr) {
    const coreContext = buildCoreExpressionContext(coreExpr);
    if (coreContext) {
      parts.push(coreContext);
    }
  }

  return parts.join('\n');
}

// ============= 连续性上下文 =============

/**
 * 构建分镜连续性上下文（用于运动提示词）
 */
export function buildContinuityContext(args: {
  prevSceneEndFrame?: string;
  nextSceneStartFrame?: string;
}): string {
  const parts: string[] = [];

  if (args.prevSceneEndFrame) {
    parts.push('## 上一分镜结束状态 (KF8)');
    parts.push(args.prevSceneEndFrame);
    parts.push('');
  }

  if (args.nextSceneStartFrame) {
    parts.push('## 下一分镜开始状态 (KF0)');
    parts.push(args.nextSceneStartFrame);
    parts.push('');
  }

  if (parts.length > 0) {
    parts.unshift('## 分镜连续性参考（请确保镜头切换连贯）');
  }

  return parts.join('\n');
}
