// ==========================================
// 级联更新管理器
// ==========================================
// 功能：
// 1. 追踪分镜之间的依赖关系
// 2. 当基础设定修改时，自动标记受影响的分镜
// 3. 提供批量更新和选择性更新选项
//
// 支持两种模式：
// - 规则引擎：快速、零延迟
// - AI智能分析：语义理解、更精准影响评估（带fallback）
// ==========================================

import { Scene, Project, SceneStatus, Skill, ChatMessage } from '@/types';
import { notifyAIFallback } from './progressBridge';

// 依赖关系类型
export type DependencyType = 'project_settings' | 'previous_scene' | 'scene_content';

// 依赖项
export interface Dependency {
  sourceId: string;
  sourceType: 'project' | 'scene';
  targetId: string;
  dependencyType: DependencyType;
}

// 更新影响分析
export interface UpdateImpact {
  affectedScenes: Scene[];
  updatePlan: UpdateAction[];
  estimatedTime: number;
}

// 更新操作
export interface UpdateAction {
  sceneId: string;
  field: 'sceneDescription' | 'actionDescription' | 'shotPrompt' | 'dialogue';
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

// 角色变更信息
export interface CharacterChange {
  characterId: string;
  field: 'appearance' | 'personality' | 'primaryColor' | 'secondaryColor' | 'name';
}

// 角色在分镜中的出现关系
export interface CharacterAppearance {
  sceneId: string;
  characterId: string;
}

// 世界观变更信息
export interface WorldViewChange {
  elementId: string;
  type: string;
}

// 分镜快照
export interface SceneSnapshot {
  sceneId: string;
  data: Omit<Scene, 'id' | 'projectId'>;
  createdAt: string;
}

/**
 * 分析项目设定修改的影响
 */
export function analyzeProjectSettingsImpact(
  project: Project,
  scenes: Scene[],
  modifiedFields: ('summary' | 'style' | 'protagonist')[],
): UpdateImpact {
  const affectedScenes: Scene[] = [];
  const updatePlan: UpdateAction[] = [];

  scenes.forEach((scene) => {
    // 如果分镜已经有内容，则标记为需要更新
    if (scene.status !== 'pending' && scene.status !== 'needs_update') {
      affectedScenes.push(scene);

      // 根据修改的字段确定需要更新的内容
      if (modifiedFields.includes('style')) {
        // 风格修改影响场景锚点和提示词
        if (scene.sceneDescription) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'sceneDescription',
            reason: '视觉风格已修改',
            priority: 'high',
          });
        }
        if (scene.shotPrompt) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'shotPrompt',
            reason: '视觉风格已修改',
            priority: 'high',
          });
        }
      }

      if (modifiedFields.includes('protagonist')) {
        // 主角修改影响所有内容
        if (scene.sceneDescription) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'sceneDescription',
            reason: '主角设定已修改',
            priority: 'high',
          });
        }
        if (scene.actionDescription) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'actionDescription',
            reason: '主角设定已修改',
            priority: 'high',
          });
        }
        if (scene.shotPrompt) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'shotPrompt',
            reason: '主角设定已修改',
            priority: 'high',
          });
        }
      }

      if (modifiedFields.includes('summary')) {
        // 故事梗概修改影响场景锚点
        if (scene.sceneDescription) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'sceneDescription',
            reason: '故事梗概已修改',
            priority: 'medium',
          });
        }
      }
    }
  });

  // 估算更新时间（每个操作约30秒）
  const estimatedTime = updatePlan.length * 30;

  return {
    affectedScenes,
    updatePlan,
    estimatedTime,
  };
}

/**
 * 分析分镜修改的影响
 */
export function analyzeSceneImpact(
  modifiedScene: Scene,
  allScenes: Scene[],
  modifiedField: 'summary' | 'sceneDescription' | 'actionDescription',
): UpdateImpact {
  const affectedScenes: Scene[] = [];
  const updatePlan: UpdateAction[] = [];

  const modifiedIndex = allScenes.findIndex((s) => s.id === modifiedScene.id);

  if (modifiedIndex === -1) {
    return { affectedScenes, updatePlan, estimatedTime: 0 };
  }

  // 1. 同一分镜的后续步骤需要更新
  if (modifiedField === 'summary' || modifiedField === 'sceneDescription') {
    if (modifiedScene.actionDescription) {
      updatePlan.push({
        sceneId: modifiedScene.id,
        field: 'actionDescription',
        reason: `${modifiedField === 'summary' ? '分镜概要' : '场景锚点'}已修改`,
        priority: 'high',
      });
    }
    if (modifiedScene.shotPrompt) {
      updatePlan.push({
        sceneId: modifiedScene.id,
        field: 'shotPrompt',
        reason: `${modifiedField === 'summary' ? '分镜概要' : '场景锚点'}已修改`,
        priority: 'high',
      });
    }
  }

  if (modifiedField === 'actionDescription' && modifiedScene.shotPrompt) {
    updatePlan.push({
      sceneId: modifiedScene.id,
      field: 'shotPrompt',
      reason: '动作描述已修改',
      priority: 'high',
    });
  }

  // 2. 下一个分镜可能需要更新（因为上下文变了）
  const nextScene = allScenes[modifiedIndex + 1];
  if (nextScene && nextScene.sceneDescription) {
    affectedScenes.push(nextScene);
    updatePlan.push({
      sceneId: nextScene.id,
      field: 'sceneDescription',
      reason: '前序分镜已修改，可能影响连贯性',
      priority: 'low',
    });
  }

  const estimatedTime = updatePlan.length * 30;

  return {
    affectedScenes,
    updatePlan,
    estimatedTime,
  };
}

/**
 * 标记受影响的分镜为needs_update状态
 */
export function markScenesNeedUpdate(scenes: Scene[], affectedSceneIds: string[]): Scene[] {
  return scenes.map((scene) => {
    if (affectedSceneIds.includes(scene.id)) {
      return {
        ...scene,
        status: 'needs_update' as SceneStatus,
      };
    }
    return scene;
  });
}

/**
 * 获取需要更新的分镜列表
 */
export function getScenesNeedingUpdate(scenes: Scene[]): Scene[] {
  return scenes.filter((scene) => scene.status === 'needs_update');
}

/**
 * 生成更新计划摘要
 */
export function generateUpdateSummary(impact: UpdateImpact): string {
  const { affectedScenes, updatePlan, estimatedTime } = impact;

  if (updatePlan.length === 0) {
    return '无需更新';
  }

  const highPriority = updatePlan.filter((a) => a.priority === 'high').length;
  const mediumPriority = updatePlan.filter((a) => a.priority === 'medium').length;
  const lowPriority = updatePlan.filter((a) => a.priority === 'low').length;

  const minutes = Math.ceil(estimatedTime / 60);

  return `
共${affectedScenes.length}个分镜受影响，需要执行${updatePlan.length}个更新操作
- 高优先级: ${highPriority}个
- 中优先级: ${mediumPriority}个
- 低优先级: ${lowPriority}个
预计耗时: ${minutes}分钟
  `.trim();
}

/**
 * 按优先级排序更新操作
 */
export function sortUpdateActions(actions: UpdateAction[]): UpdateAction[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  return [...actions].sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * 检查分镜是否需要更新
 */
export function needsUpdate(scene: Scene): boolean {
  return scene.status === 'needs_update';
}

/**
 * 清除needs_update标记
 */
export function clearUpdateFlag(scene: Scene, updatedField: string): Scene {
  // 根据更新的字段决定新状态
  const fieldStatusMap: Record<string, SceneStatus> = {
    sceneDescription: 'scene_confirmed',
    actionDescription: 'keyframe_confirmed', // 向后兼容，已废弃
    shotPrompt: 'keyframe_confirmed',
    motionPrompt: 'completed',
  };

  return {
    ...scene,
    status: fieldStatusMap[updatedField] || scene.status,
  };
}

/**
 * 批量清除更新标记
 */
export function clearUpdateFlags(scenes: Scene[], sceneIds: string[]): Scene[] {
  return scenes.map((scene) => {
    if (sceneIds.includes(scene.id) && scene.status === 'needs_update') {
      // 恢复到完成状态
      return {
        ...scene,
        status: 'completed' as SceneStatus,
      };
    }
    return scene;
  });
}

// ==========================================
// 策略C: 智能标记+批量确认+版本快照
// ==========================================

/**
 * 分析角色设定变更的影响
 */
export function analyzeCharacterImpact(
  change: CharacterChange,
  scenes: Scene[],
  appearances: CharacterAppearance[],
): UpdateImpact {
  const affectedSceneIds = appearances
    .filter((a) => a.characterId === change.characterId)
    .map((a) => a.sceneId);

  const affectedScenes = scenes.filter(
    (scene) =>
      affectedSceneIds.includes(scene.id) &&
      scene.status !== 'pending' &&
      scene.status !== 'needs_update',
  );

  const updatePlan: UpdateAction[] = [];

  affectedScenes.forEach((scene) => {
    // 根据变更的字段决定需要更新的内容
    switch (change.field) {
      case 'appearance':
      case 'primaryColor':
      case 'secondaryColor':
        // 外貌和主题色影响关键帧提示词
        if (scene.shotPrompt) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'shotPrompt',
            reason: `角色${change.field === 'appearance' ? '外貌' : '主题色'}已修改`,
            priority: 'high',
          });
        }
        break;
      case 'personality':
        // 性格影响台词
        updatePlan.push({
          sceneId: scene.id,
          field: 'dialogue',
          reason: '角色性格已修改',
          priority: 'medium',
        });
        break;
      case 'name':
        // 名字影响所有内容
        if (scene.sceneDescription) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'sceneDescription',
            reason: '角色名称已修改',
            priority: 'high',
          });
        }
        if (scene.shotPrompt) {
          updatePlan.push({
            sceneId: scene.id,
            field: 'shotPrompt',
            reason: '角色名称已修改',
            priority: 'high',
          });
        }
        break;
    }
  });

  return {
    affectedScenes,
    updatePlan,
    estimatedTime: updatePlan.length * 30,
  };
}

/**
 * 分析世界观变更的影响
 */
export function analyzeWorldViewImpact(change: WorldViewChange, scenes: Scene[]): UpdateImpact {
  // 世界观修改影响所有已完成的分镜
  const affectedScenes = scenes.filter(
    (scene) => scene.status !== 'pending' && scene.status !== 'needs_update',
  );

  const updatePlan: UpdateAction[] = [];

  affectedScenes.forEach((scene) => {
    // 世界观主要影响场景锚点
    if (scene.sceneDescription) {
      updatePlan.push({
        sceneId: scene.id,
        field: 'sceneDescription',
        reason: `世界观设定(${change.type})已修改`,
        priority: 'medium',
      });
    }
    // 也可能影响关键帧提示词（取决于世界观类型）
    if (change.type === 'geography' && scene.shotPrompt) {
      updatePlan.push({
        sceneId: scene.id,
        field: 'shotPrompt',
        reason: '地理设定已修改',
        priority: 'low',
      });
    }
  });

  return {
    affectedScenes,
    updatePlan,
    estimatedTime: updatePlan.length * 30,
  };
}

/**
 * 创建单个分镜的快照
 */
export function createSceneSnapshot(scene: Scene): SceneSnapshot {
  const { id, projectId, ...data } = scene;
  return {
    sceneId: scene.id,
    data,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 批量创建分镜快照
 */
export function createBatchSnapshot(scenes: Scene[]): SceneSnapshot[] {
  return scenes.map((scene) => createSceneSnapshot(scene));
}

/**
 * 从快照恢复分镜
 */
export function restoreFromSnapshot(scene: Scene, snapshot: SceneSnapshot): Scene {
  return {
    ...scene,
    ...snapshot.data,
    id: scene.id,
    projectId: scene.projectId,
  };
}

/**
 * 根据影响分析生成批量更新选项
 */
export function generateUpdateOptions(impact: UpdateImpact): string[] {
  const options: string[] = ['skip']; // 跳过总是可用

  if (impact.updatePlan.length === 0) {
    return options;
  }

  // 添加全部重新生成选项
  options.unshift('all');

  // 检查是否有场景锚点更新
  const hasSceneUpdates = impact.updatePlan.some((action) => action.field === 'sceneDescription');
  if (hasSceneUpdates) {
    options.splice(1, 0, 'scene_only');
  }

  // 检查是否有提示词更新
  const hasPromptUpdates = impact.updatePlan.some((action) => action.field === 'shotPrompt');
  if (hasPromptUpdates) {
    options.splice(options.indexOf('skip'), 0, 'prompt_only');
  }

  return options;
}

// ==========================================
// AI Skill 定义
// ==========================================

/** 角色变更影响分析技能 */
export const CharacterImpactAnalysisSkill: Skill = {
  name: 'character-impact-analysis',
  description: '分析角色设定变更对分镜的影响',
  requiredContext: ['character_info', 'scene_description'],
  promptTemplate: `你是一位专业的漫画剧本编导。分析角色设定变更对分镜的影响。

## 角色变更信息
角色: {character_name}
变更字段: {changed_field}
变更内容: {change_description}

## 分镜内容
{scene_content}

## 分析要求
请分析这个角色变更对该分镜的影响，输出JSON格式：
- needsUpdate: boolean (是否需要更新)
- affectedFields: string[] (受影响的字段，如["sceneDescription", "shotPrompt", "dialogue"])
- priority: "high" | "medium" | "low" (更新优先级)
- reason: string (影响原因)

直接输出JSON，不要额外解释。`,
  outputFormat: { type: 'json', maxLength: 300 },
  maxTokens: 400,
};

/** 世界观变更影响分析技能 */
export const WorldViewImpactAnalysisSkill: Skill = {
  name: 'worldview-impact-analysis',
  description: '分析世界观设定变更对分镜的影响',
  requiredContext: ['scene_description', 'style'],
  promptTemplate: `你是一位专业的漫画剧本编导。分析世界观设定变更对分镜的影响。

## 世界观变更信息
类型: {worldview_type}
变更内容: {change_description}

## 分镜内容
{scene_content}

## 分析要求
请分析这个世界观变更对该分镜的影响，输出JSON格式：
- needsUpdate: boolean (是否需要更新)
- affectedFields: string[] (受影响的字段，如["sceneDescription", "shotPrompt"])
- priority: "high" | "medium" | "low" (更新优先级)
- reason: string (影响原因)
- relevance: "direct" | "indirect" | "none" (与场景的关联程度)

直接输出JSON，不要额外解释。`,
  outputFormat: { type: 'json', maxLength: 300 },
  maxTokens: 400,
};

// ==========================================
// AI 客户端接口
// ==========================================
interface SimpleAIClient {
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>;
}

// ==========================================
// AI 智能版本函数
// ==========================================

/**
 * AI智能分析角色变更影响（带fallback）
 */
export async function analyzeCharacterImpactWithAI(
  client: SimpleAIClient,
  change: CharacterChange,
  characterName: string,
  changeDescription: string,
  scenes: Scene[],
  appearances: CharacterAppearance[],
): Promise<UpdateImpact> {
  try {
    const affectedSceneIds = appearances
      .filter((a) => a.characterId === change.characterId)
      .map((a) => a.sceneId);

    const candidateScenes = scenes.filter(
      (scene) =>
        affectedSceneIds.includes(scene.id) &&
        scene.status !== 'pending' &&
        scene.status !== 'needs_update',
    );

    const updatePlan: UpdateAction[] = [];
    const affectedScenes: Scene[] = [];

    // 为每个相关分镜进行AI分析
    for (const scene of candidateScenes) {
      const prompt = CharacterImpactAnalysisSkill.promptTemplate
        .replace('{character_name}', characterName)
        .replace('{changed_field}', change.field)
        .replace('{change_description}', changeDescription)
        .replace(
          '{scene_content}',
          `概要: ${scene.summary}\n描述: ${scene.sceneDescription || '无'}`,
        );

      const response = await client.chat([{ role: 'user', content: prompt }]);
      const analysis = JSON.parse(response.content);

      if (analysis.needsUpdate) {
        affectedScenes.push(scene);
        for (const field of analysis.affectedFields) {
          updatePlan.push({
            sceneId: scene.id,
            field: field as UpdateAction['field'],
            reason: analysis.reason,
            priority: analysis.priority,
          });
        }
      }
    }

    return {
      affectedScenes,
      updatePlan,
      estimatedTime: updatePlan.length * 30,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('角色影响分析', err, '规则引擎');
    console.warn('AI角色影响分析失败，回退到规则引擎:', error);
    return analyzeCharacterImpact(change, scenes, appearances);
  }
}

/**
 * AI智能分析世界观变更影响（带fallback）
 */
export async function analyzeWorldViewImpactWithAI(
  client: SimpleAIClient,
  change: WorldViewChange,
  changeDescription: string,
  scenes: Scene[],
): Promise<UpdateImpact> {
  try {
    const candidateScenes = scenes.filter(
      (scene) => scene.status !== 'pending' && scene.status !== 'needs_update',
    );

    const updatePlan: UpdateAction[] = [];
    const affectedScenes: Scene[] = [];

    // 为每个分镜进行AI分析
    for (const scene of candidateScenes) {
      const prompt = WorldViewImpactAnalysisSkill.promptTemplate
        .replace('{worldview_type}', change.type)
        .replace('{change_description}', changeDescription)
        .replace(
          '{scene_content}',
          `概要: ${scene.summary}\n描述: ${scene.sceneDescription || '无'}`,
        );

      const response = await client.chat([{ role: 'user', content: prompt }]);
      const analysis = JSON.parse(response.content);

      // 只处理有直接或间接关联的场景
      if (analysis.needsUpdate && analysis.relevance !== 'none') {
        affectedScenes.push(scene);
        for (const field of analysis.affectedFields) {
          updatePlan.push({
            sceneId: scene.id,
            field: field as UpdateAction['field'],
            reason: analysis.reason,
            priority: analysis.priority,
          });
        }
      }
    }

    return {
      affectedScenes,
      updatePlan,
      estimatedTime: updatePlan.length * 30,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('世界观影响分析', err, '规则引擎');
    console.warn('AI世界观影响分析失败，回退到规则引擎:', error);
    return analyzeWorldViewImpact(change, scenes);
  }
}
