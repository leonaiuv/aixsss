import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore, type ProjectUIState } from './projectStore';
import type { ProjectState } from '@/types';

// =====================
// 测试用例
// =====================
describe('projectStore', () => {
  // 使用 useProjectStore 单例
  const store = useProjectStore;

  beforeEach(() => {
    // 每个测试前重置状态
    store.getState().reset();
  });

  describe('初始状态', () => {
    it('应该有正确的初始值', () => {
      const state = store.getState();

      expect(state.isLoading).toBe(false);
      expect(state.currentThreadId).toBeNull();
      expect(state.selectedSceneIndex).toBe(0);
      expect(state.isGenerating).toBe(false);
      expect(state.generatingStep).toBeNull();
      expect(state.error).toBeNull();
      expect(state.projectState).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('应该正确设置 loading 状态', () => {
      store.getState().setLoading(true);
      expect(store.getState().isLoading).toBe(true);

      store.getState().setLoading(false);
      expect(store.getState().isLoading).toBe(false);
    });
  });

  describe('setCurrentThread', () => {
    it('应该正确设置当前线程 ID', () => {
      store.getState().setCurrentThread('thread-123');
      expect(store.getState().currentThreadId).toBe('thread-123');
    });

    it('应该可以设置为 null', () => {
      store.getState().setCurrentThread('thread-123');
      store.getState().setCurrentThread(null);
      expect(store.getState().currentThreadId).toBeNull();
    });
  });

  describe('setSelectedScene', () => {
    it('应该正确设置选中的分镜索引', () => {
      store.getState().setSelectedScene(3);
      expect(store.getState().selectedSceneIndex).toBe(3);
    });
  });

  describe('setGenerating', () => {
    it('应该正确设置生成状态和步骤', () => {
      store.getState().setGenerating(true, '生成分镜中...');

      const state = store.getState();
      expect(state.isGenerating).toBe(true);
      expect(state.generatingStep).toBe('生成分镜中...');
    });

    it('无步骤参数时 generatingStep 应为 null', () => {
      store.getState().setGenerating(true);
      expect(store.getState().generatingStep).toBeNull();
    });

    it('停止生成时应清除步骤', () => {
      store.getState().setGenerating(true, '生成中...');
      store.getState().setGenerating(false);

      const state = store.getState();
      expect(state.isGenerating).toBe(false);
      expect(state.generatingStep).toBeNull();
    });
  });

  describe('setError', () => {
    it('应该正确设置错误信息', () => {
      store.getState().setError('发生了错误');
      expect(store.getState().error).toBe('发生了错误');
    });

    it('应该可以清除错误', () => {
      store.getState().setError('错误');
      store.getState().setError(null);
      expect(store.getState().error).toBeNull();
    });
  });

  describe('syncFromAgent', () => {
    it('应该正确同步 Agent 状态', () => {
      const mockProjectState: ProjectState = {
        projectId: 'test-1',
        title: '测试项目',
        summary: '项目简介',
        artStyle: '赛博朋克',
        protagonist: '主角',
        workflowState: 'IDLE',
        scenes: [],
        currentSceneIndex: 0,
        canvasContent: [],
        characters: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      store.getState().syncFromAgent(mockProjectState);

      const state = store.getState();
      expect(state.projectState).toEqual(mockProjectState);
      expect(state.projectState?.title).toBe('测试项目');
    });
  });

  describe('reset', () => {
    it('应该重置所有状态为初始值', () => {
      // 先修改状态
      store.getState().setLoading(true);
      store.getState().setCurrentThread('thread-1');
      store.getState().setSelectedScene(5);
      store.getState().setError('错误');

      // 重置
      store.getState().reset();

      const state = store.getState();
      expect(state.isLoading).toBe(false);
      expect(state.currentThreadId).toBeNull();
      expect(state.selectedSceneIndex).toBe(0);
      expect(state.error).toBeNull();
    });
  });

  describe('状态订阅', () => {
    it('应该能够订阅状态变化', () => {
      const callback = vi.fn();

      store.subscribe(
        (state: ProjectUIState) => state.isLoading,
        callback
      );

      store.getState().setLoading(true);
      expect(callback).toHaveBeenCalledWith(true, false);
    });
  });

  describe('避免闭包陷阱', () => {
    it('使用 getState() 应该获取最新状态', async () => {
      // 模拟连续异步操作中的状态读取
      store.getState().setSelectedScene(0);

      // 模拟第一个异步操作
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.getState().setSelectedScene(1);

      // 模拟第二个异步操作
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.getState().setSelectedScene(2);

      // 从 store 直接获取最新状态
      expect(store.getState().selectedSceneIndex).toBe(2);
    });
  });
});
