import { describe, it, expect, beforeEach } from 'vitest';
import {
  CheckpointStore,
  createMemoryCheckpointStore,
  type ProjectCheckpoint,
} from './store';
import type { WorkflowState } from '@/types';

describe('CheckpointStore', () => {
  let store: CheckpointStore;

  beforeEach(() => {
    store = createMemoryCheckpointStore();
  });

  describe('createMemoryCheckpointStore', () => {
    it('应该创建一个内存存储实例', () => {
      expect(store).toBeDefined();
      expect(store.save).toBeDefined();
      expect(store.load).toBeDefined();
      expect(store.list).toBeDefined();
      expect(store.delete).toBeDefined();
    });
  });

  describe('save', () => {
    it('应该保存检查点', async () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'test-project-1',
        threadId: 'thread-1',
        workflowState: 'COLLECTING_BASIC_INFO',
        title: '测试项目',
        summary: '这是一个测试故事',
        artStyle: '动漫风格',
        protagonist: '主角信息',
        scenes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const id = await store.save(checkpoint);
      expect(id).toBe('test-project-1');
    });

    it('应该更新已存在的检查点', async () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'test-project-1',
        threadId: 'thread-1',
        workflowState: 'COLLECTING_BASIC_INFO',
        title: '原始标题',
        summary: '',
        artStyle: '',
        protagonist: '',
        scenes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(checkpoint);
      
      const updatedCheckpoint = {
        ...checkpoint,
        title: '更新后的标题',
        workflowState: 'GENERATING_SCENES' as WorkflowState,
      };
      
      await store.save(updatedCheckpoint);
      
      const loaded = await store.load('test-project-1');
      expect(loaded?.title).toBe('更新后的标题');
      expect(loaded?.workflowState).toBe('GENERATING_SCENES');
    });
  });

  describe('load', () => {
    it('应该加载已保存的检查点', async () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'test-project-2',
        threadId: 'thread-2',
        workflowState: 'IDLE',
        title: '加载测试',
        summary: '测试简介',
        artStyle: '水墨风格',
        protagonist: '主角描述',
        scenes: [
          {
            id: 'scene-1',
            order: 1,
            summary: '分镜1',
            status: 'pending',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(checkpoint);
      const loaded = await store.load('test-project-2');

      expect(loaded).toBeDefined();
      expect(loaded?.projectId).toBe('test-project-2');
      expect(loaded?.title).toBe('加载测试');
      expect(loaded?.scenes).toHaveLength(1);
    });

    it('加载不存在的检查点应返回 null', async () => {
      const loaded = await store.load('non-existent');
      expect(loaded).toBeNull();
    });
  });

  describe('list', () => {
    it('应该列出所有检查点', async () => {
      const checkpoint1: ProjectCheckpoint = {
        projectId: 'project-1',
        threadId: 'thread-1',
        workflowState: 'IDLE',
        title: '项目1',
        summary: '',
        artStyle: '',
        protagonist: '',
        scenes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const checkpoint2: ProjectCheckpoint = {
        projectId: 'project-2',
        threadId: 'thread-2',
        workflowState: 'COLLECTING_BASIC_INFO',
        title: '项目2',
        summary: '',
        artStyle: '',
        protagonist: '',
        scenes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(checkpoint1);
      await store.save(checkpoint2);

      const list = await store.list();
      expect(list).toHaveLength(2);
      expect(list.map(c => c.projectId)).toContain('project-1');
      expect(list.map(c => c.projectId)).toContain('project-2');
    });
  });

  describe('delete', () => {
    it('应该删除检查点', async () => {
      const checkpoint: ProjectCheckpoint = {
        projectId: 'delete-test',
        threadId: 'thread-d',
        workflowState: 'IDLE',
        title: '待删除',
        summary: '',
        artStyle: '',
        protagonist: '',
        scenes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.save(checkpoint);
      expect(await store.load('delete-test')).toBeDefined();

      await store.delete('delete-test');
      expect(await store.load('delete-test')).toBeNull();
    });

    it('删除不存在的检查点不应报错', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('WorkflowState', () => {
    it('应该支持所有工作流状态', async () => {
      const states: WorkflowState[] = [
        'IDLE',
        'COLLECTING_BASIC_INFO',
        'BASIC_INFO_COMPLETE',
        'GENERATING_SCENES',
        'SCENE_LIST_EDITING',
        'SCENE_LIST_CONFIRMED',
        'REFINING_SCENES',
        'ALL_SCENES_COMPLETE',
        'EXPORTING',
        'EXPORTED',
      ];

      for (const state of states) {
        const checkpoint: ProjectCheckpoint = {
          projectId: `state-${state}`,
          threadId: 'thread',
          workflowState: state,
          title: `${state} 测试`,
          summary: '',
          artStyle: '',
          protagonist: '',
          scenes: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await store.save(checkpoint);
        const loaded = await store.load(`state-${state}`);
        expect(loaded?.workflowState).toBe(state);
      }
    });
  });
});
