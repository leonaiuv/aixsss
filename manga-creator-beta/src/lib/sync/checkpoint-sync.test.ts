import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkpointToProjectState,
  scenesToCanvasBlocks,
  projectInfoToCanvasBlock,
  syncCheckpointToStores,
} from './checkpoint-sync';
import type { ProjectCheckpoint, Scene } from '@/lib/checkpoint/store';
import { resetMemoryCheckpointStore, getMemoryCheckpointStore } from '@/lib/checkpoint/store';
import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore } from '@/stores/canvasStore';

describe('checkpoint-sync', () => {
  beforeEach(() => {
    // 重置所有 stores
    resetMemoryCheckpointStore();
    useProjectStore.getState().reset();
    useCanvasStore.getState().reset();
  });

  describe('checkpointToProjectState', () => {
    it('应该正确转换 Checkpoint 为 ProjectState', () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'proj-1',
        threadId: 'thread-1',
        workflowState: 'GENERATING_SCENES',
        title: '测试漫画',
        summary: '这是一个测试故事',
        artStyle: '日式动漫风格',
        protagonist: '小明',
        scenes: [
          {
            id: 'scene-1',
            order: 1,
            summary: '第一幕',
            status: 'pending',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      };

      const result = checkpointToProjectState(checkpoint);

      expect(result.projectId).toBe('proj-1');
      expect(result.workflowState).toBe('GENERATING_SCENES');
      expect(result.title).toBe('测试漫画');
      expect(result.summary).toBe('这是一个测试故事');
      expect(result.artStyle).toBe('日式动漫风格');
      expect(result.protagonist).toBe('小明');
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0].dialogues).toEqual([]);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('scenesToCanvasBlocks', () => {
    it('应该正确转换分镜为画布块', () => {
      const scenes: Scene[] = [
        {
          id: 'scene-1',
          order: 1,
          summary: '主角出场',
          status: 'completed',
          keyframePrompt: 'a hero standing',
        },
        {
          id: 'scene-2',
          order: 2,
          summary: '对决',
          status: 'pending',
        },
      ];

      const blocks = scenesToCanvasBlocks(scenes, '日式动漫风格');

      expect(blocks).toHaveLength(2);
      expect(blocks[0].id).toBe('scene-1');
      expect(blocks[0].type).toBe('scene');
      expect(blocks[0].content.fullPrompt).toBe('日式动漫风格, a hero standing');
      expect(blocks[1].content.fullPrompt).toBe('');
    });
  });

  describe('projectInfoToCanvasBlock', () => {
    it('应该正确转换项目信息为画布块', () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'proj-1',
        threadId: 'thread-1',
        workflowState: 'IDLE',
        title: '测试漫画',
        summary: '这是一个测试故事',
        artStyle: '日式动漫风格',
        protagonist: '小明',
        scenes: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const block = projectInfoToCanvasBlock(checkpoint);

      expect(block.id).toBe('basicInfo-proj-1');
      expect(block.type).toBe('basicInfo');
      expect(block.content.title).toBe('测试漫画');
      expect(block.content.summary).toBe('这是一个测试故事');
      expect(block.content.artStyle).toBe('日式动漫风格');
      expect(block.content.protagonist).toBe('小明');
    });
  });

  describe('syncCheckpointToStores', () => {
    it('应该同步 Checkpoint 到 UI Stores', async () => {
      // 准备测试数据
      const store = getMemoryCheckpointStore();
      const checkpoint: ProjectCheckpoint = {
        projectId: 'proj-sync-1',
        threadId: 'thread-1',
        workflowState: 'SCENE_LIST_CONFIRMED',
        title: '同步测试',
        summary: '测试同步功能',
        artStyle: '写实风格',
        protagonist: '张三',
        scenes: [
          {
            id: 'scene-sync-1',
            order: 1,
            summary: '开场',
            status: 'completed',
            keyframePrompt: 'opening scene',
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      await store.save(checkpoint);

      // 执行同步
      const result = await syncCheckpointToStores('proj-sync-1');

      // 验证结果
      expect(result.success).toBe(true);
      expect(result.projectId).toBe('proj-sync-1');

      // 验证 projectStore 同步
      const projectState = useProjectStore.getState().projectState;
      expect(projectState).not.toBeNull();
      expect(projectState?.title).toBe('同步测试');
      expect(projectState?.workflowState).toBe('SCENE_LIST_CONFIRMED');

      // 验证 canvasStore 同步
      const blocks = useCanvasStore.getState().blocks;
      expect(blocks).toHaveLength(2); // basicInfo + 1 scene
      expect(blocks[0].type).toBe('basicInfo');
      expect(blocks[1].type).toBe('scene');
    });

    it('项目不存在时应返回错误', async () => {
      const result = await syncCheckpointToStores('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
