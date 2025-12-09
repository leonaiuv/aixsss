import { describe, it, expect } from 'vitest';
import {
  analyzeProjectSettingsImpact,
  analyzeSceneImpact,
  markScenesNeedUpdate,
  getScenesNeedingUpdate,
  generateUpdateSummary,
  sortUpdateActions,
  needsUpdate,
  clearUpdateFlag,
  clearUpdateFlags,
} from './cascadeUpdater';
import { Project, Scene } from '@/types';

describe('CascadeUpdater', () => {
  const mockProject: Project = {
    id: 'test-project',
    title: '测试项目',
    summary: '测试故事',
    style: '奇幻风格',
    protagonist: '年轻的冒险者',
    workflowState: 'SCENE_PROCESSING',
    currentSceneOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockScenes: Scene[] = [
    {
      id: 'scene-1',
      projectId: 'test-project',
      order: 1,
      summary: '开场',
      sceneDescription: '森林场景',
      actionDescription: '主角行走',
      shotPrompt: 'forest scene',
      motionPrompt: 'character walks forward, camera follows',
      status: 'completed',
      notes: '',
    },
    {
      id: 'scene-2',
      projectId: 'test-project',
      order: 2,
      summary: '相遇',
      sceneDescription: '城镇场景',
      actionDescription: '主角与老人对话',
      shotPrompt: 'town scene',
      motionPrompt: 'characters talking, subtle gestures',
      status: 'completed',
      notes: '',
    },
    {
      id: 'scene-3',
      projectId: 'test-project',
      order: 3,
      summary: '战斗',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      status: 'pending',
      notes: '',
    },
  ];

  describe('analyzeProjectSettingsImpact', () => {
    it('风格修改应该影响场景描述和提示词', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['style']
      );
      
      expect(impact.affectedScenes.length).toBe(2); // 只有已完成的分镜受影响
      expect(impact.updatePlan.length).toBeGreaterThan(0);
      
      const hasSceneUpdate = impact.updatePlan.some(
        action => action.field === 'sceneDescription'
      );
      const hasPromptUpdate = impact.updatePlan.some(
        action => action.field === 'shotPrompt'
      );
      
      expect(hasSceneUpdate).toBe(true);
      expect(hasPromptUpdate).toBe(true);
    });

    it('主角修改应该影响所有内容', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['protagonist']
      );
      
      const updateFields = impact.updatePlan.map(action => action.field);
      
      expect(updateFields).toContain('sceneDescription');
      expect(updateFields).toContain('actionDescription');
      expect(updateFields).toContain('shotPrompt');
    });

    it('故事梗概修改应该影响场景描述', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['summary']
      );
      
      const hasSceneUpdate = impact.updatePlan.some(
        action => action.field === 'sceneDescription'
      );
      
      expect(hasSceneUpdate).toBe(true);
    });

    it('应该正确计算预估时间', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['style']
      );
      
      expect(impact.estimatedTime).toBe(impact.updatePlan.length * 30);
    });

    it('未完成的分镜不应该受影响', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['style']
      );
      
      const affectedIds = impact.affectedScenes.map(s => s.id);
      expect(affectedIds).not.toContain('scene-3'); // pending状态
    });
  });

  describe('analyzeSceneImpact', () => {
    it('修改分镜概要应该影响同一分镜的后续步骤', () => {
      const modifiedScene = mockScenes[0];
      const impact = analyzeSceneImpact(modifiedScene, mockScenes, 'summary');
      
      expect(impact.updatePlan.length).toBeGreaterThan(0);
      
      const sameSceneUpdates = impact.updatePlan.filter(
        action => action.sceneId === modifiedScene.id
      );
      
      expect(sameSceneUpdates.length).toBeGreaterThan(0);
    });

    it('修改场景描述应该影响动作和提示词', () => {
      const modifiedScene = mockScenes[0];
      const impact = analyzeSceneImpact(modifiedScene, mockScenes, 'sceneDescription');
      
      const hasActionUpdate = impact.updatePlan.some(
        action => action.field === 'actionDescription'
      );
      const hasPromptUpdate = impact.updatePlan.some(
        action => action.field === 'shotPrompt'
      );
      
      expect(hasActionUpdate).toBe(true);
      expect(hasPromptUpdate).toBe(true);
    });

    it('修改动作描述应该只影响提示词', () => {
      const modifiedScene = mockScenes[0];
      const impact = analyzeSceneImpact(modifiedScene, mockScenes, 'actionDescription');
      
      const hasPromptUpdate = impact.updatePlan.some(
        action => action.field === 'shotPrompt'
      );
      // actionDescription修改会影响自己的actionDescription和shotPrompt
      // 不会影响sceneDescription
      const hasSceneDescUpdate = impact.updatePlan.filter(
        action => action.field === 'sceneDescription'
      );
      
      expect(hasPromptUpdate).toBe(true);
      // sceneDescription的更新只应该是低优先级的下一个分镜（如果有的话）
      const highPrioSceneUpdate = hasSceneDescUpdate.find(a => a.priority === 'high');
      expect(highPrioSceneUpdate).toBeUndefined();
    });

    it('应该影响下一个分镜（低优先级）', () => {
      const modifiedScene = mockScenes[0];
      const impact = analyzeSceneImpact(modifiedScene, mockScenes, 'summary');
      
      const nextSceneUpdate = impact.updatePlan.find(
        action => action.sceneId === mockScenes[1].id
      );
      
      expect(nextSceneUpdate).toBeDefined();
      expect(nextSceneUpdate?.priority).toBe('low');
    });
  });

  describe('markScenesNeedUpdate', () => {
    it('应该标记指定分镜为needs_update', () => {
      const marked = markScenesNeedUpdate(mockScenes, ['scene-1', 'scene-2']);
      
      expect(marked[0].status).toBe('needs_update');
      expect(marked[1].status).toBe('needs_update');
      expect(marked[2].status).toBe('pending'); // 未标记的保持原状
    });

    it('未指定的分镜应该保持原状态', () => {
      const marked = markScenesNeedUpdate(mockScenes, ['scene-1']);
      
      expect(marked[1].status).toBe('completed');
      expect(marked[2].status).toBe('pending');
    });
  });

  describe('getScenesNeedingUpdate', () => {
    it('应该返回所有需要更新的分镜', () => {
      const scenesWithUpdate: Scene[] = [
        { ...mockScenes[0], status: 'needs_update' },
        { ...mockScenes[1], status: 'completed' },
        { ...mockScenes[2], status: 'needs_update' },
      ];
      
      const needingUpdate = getScenesNeedingUpdate(scenesWithUpdate);
      
      expect(needingUpdate.length).toBe(2);
      expect(needingUpdate.every(s => s.status === 'needs_update')).toBe(true);
    });

    it('没有需要更新的分镜时应该返回空数组', () => {
      const needingUpdate = getScenesNeedingUpdate(mockScenes);
      
      expect(needingUpdate.length).toBe(0);
    });
  });

  describe('generateUpdateSummary', () => {
    it('应该生成正确的更新摘要', () => {
      const impact = analyzeProjectSettingsImpact(
        mockProject,
        mockScenes,
        ['style']
      );
      
      const summary = generateUpdateSummary(impact);
      
      expect(summary).toContain('个分镜受影响');
      expect(summary).toContain('个更新操作');
      expect(summary).toContain('预计耗时');
    });

    it('无需更新时应该返回相应消息', () => {
      const impact = {
        affectedScenes: [],
        updatePlan: [],
        estimatedTime: 0,
      };
      
      const summary = generateUpdateSummary(impact);
      
      expect(summary).toBe('无需更新');
    });
  });

  describe('sortUpdateActions', () => {
    it('应该按优先级排序更新操作', () => {
      const actions = [
        { sceneId: 's1', field: 'sceneDescription' as const, reason: 'test', priority: 'low' as const },
        { sceneId: 's2', field: 'actionDescription' as const, reason: 'test', priority: 'high' as const },
        { sceneId: 's3', field: 'shotPrompt' as const, reason: 'test', priority: 'medium' as const },
      ];
      
      const sorted = sortUpdateActions(actions);
      
      expect(sorted[0].priority).toBe('high');
      expect(sorted[1].priority).toBe('medium');
      expect(sorted[2].priority).toBe('low');
    });
  });

  describe('needsUpdate', () => {
    it('状态为needs_update时应该返回true', () => {
      const scene: Scene = {
        ...mockScenes[0],
        status: 'needs_update',
      };
      
      expect(needsUpdate(scene)).toBe(true);
    });

    it('其他状态应该返回false', () => {
      expect(needsUpdate(mockScenes[0])).toBe(false);
      expect(needsUpdate(mockScenes[2])).toBe(false);
    });
  });

  describe('clearUpdateFlag', () => {
    it('应该根据更新的字段设置正确的状态', () => {
      const scene: Scene = {
        ...mockScenes[0],
        status: 'needs_update',
      };
      
      const sceneUpdated = clearUpdateFlag(scene, 'sceneDescription');
      expect(sceneUpdated.status).toBe('scene_confirmed');
      
      const actionUpdated = clearUpdateFlag(scene, 'actionDescription');
      expect(actionUpdated.status).toBe('keyframe_confirmed');
      
      const keyframeUpdated = clearUpdateFlag(scene, 'shotPrompt');
      expect(keyframeUpdated.status).toBe('keyframe_confirmed');
      
      const motionUpdated = clearUpdateFlag(scene, 'motionPrompt');
      expect(motionUpdated.status).toBe('completed');
    });
  });

  describe('clearUpdateFlags', () => {
    it('应该批量清除更新标记', () => {
      const scenesWithUpdate: Scene[] = [
        { ...mockScenes[0], status: 'needs_update' },
        { ...mockScenes[1], status: 'needs_update' },
        { ...mockScenes[2], status: 'pending' },
      ];
      
      const cleared = clearUpdateFlags(scenesWithUpdate, ['scene-1', 'scene-2']);
      
      expect(cleared[0].status).toBe('completed');
      expect(cleared[1].status).toBe('completed');
      expect(cleared[2].status).toBe('pending');
    });

    it('未指定的分镜应该保持原状态', () => {
      const scenesWithUpdate: Scene[] = [
        { ...mockScenes[0], status: 'needs_update' },
        { ...mockScenes[1], status: 'completed' },
      ];
      
      const cleared = clearUpdateFlags(scenesWithUpdate, ['scene-1']);
      
      expect(cleared[1].status).toBe('completed');
    });
  });
});
