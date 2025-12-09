// ==========================================
// 级联更新管理器
// ==========================================
// 功能：
// 1. 追踪分镜之间的依赖关系
// 2. 当基础设定修改时，自动标记受影响的分镜
// 3. 提供批量更新和选择性更新选项
// ==========================================

import { Scene, Project, SceneStatus } from '@/types';

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
  field: 'sceneDescription' | 'actionDescription' | 'shotPrompt';
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * 分析项目设定修改的影响
 */
export function analyzeProjectSettingsImpact(
  project: Project,
  scenes: Scene[],
  modifiedFields: ('summary' | 'style' | 'protagonist')[]
): UpdateImpact {
  const affectedScenes: Scene[] = [];
  const updatePlan: UpdateAction[] = [];
  
  scenes.forEach(scene => {
    // 如果分镜已经有内容，则标记为需要更新
    if (scene.status !== 'pending' && scene.status !== 'needs_update') {
      affectedScenes.push(scene);
      
      // 根据修改的字段确定需要更新的内容
      if (modifiedFields.includes('style')) {
        // 风格修改影响场景描述和提示词
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
        // 故事梗概修改影响场景描述
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
  modifiedField: 'summary' | 'sceneDescription' | 'actionDescription'
): UpdateImpact {
  const affectedScenes: Scene[] = [];
  const updatePlan: UpdateAction[] = [];
  
  const modifiedIndex = allScenes.findIndex(s => s.id === modifiedScene.id);
  
  if (modifiedIndex === -1) {
    return { affectedScenes, updatePlan, estimatedTime: 0 };
  }
  
  // 1. 同一分镜的后续步骤需要更新
  if (modifiedField === 'summary' || modifiedField === 'sceneDescription') {
    if (modifiedScene.actionDescription) {
      updatePlan.push({
        sceneId: modifiedScene.id,
        field: 'actionDescription',
        reason: `${modifiedField === 'summary' ? '分镜概要' : '场景描述'}已修改`,
        priority: 'high',
      });
    }
    if (modifiedScene.shotPrompt) {
      updatePlan.push({
        sceneId: modifiedScene.id,
        field: 'shotPrompt',
        reason: `${modifiedField === 'summary' ? '分镜概要' : '场景描述'}已修改`,
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
export function markScenesNeedUpdate(
  scenes: Scene[],
  affectedSceneIds: string[]
): Scene[] {
  return scenes.map(scene => {
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
  return scenes.filter(scene => scene.status === 'needs_update');
}

/**
 * 生成更新计划摘要
 */
export function generateUpdateSummary(impact: UpdateImpact): string {
  const { affectedScenes, updatePlan, estimatedTime } = impact;
  
  if (updatePlan.length === 0) {
    return '无需更新';
  }
  
  const highPriority = updatePlan.filter(a => a.priority === 'high').length;
  const mediumPriority = updatePlan.filter(a => a.priority === 'medium').length;
  const lowPriority = updatePlan.filter(a => a.priority === 'low').length;
  
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
    actionDescription: 'action_confirmed',
    shotPrompt: 'completed',
  };
  
  return {
    ...scene,
    status: fieldStatusMap[updatedField] || scene.status,
  };
}

/**
 * 批量清除更新标记
 */
export function clearUpdateFlags(
  scenes: Scene[],
  sceneIds: string[]
): Scene[] {
  return scenes.map(scene => {
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
