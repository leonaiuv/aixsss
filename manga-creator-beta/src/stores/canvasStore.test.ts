import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './canvasStore';

describe('canvasStore', () => {
  const store = useCanvasStore;

  beforeEach(() => {
    store.getState().reset();
  });

  describe('初始状态', () => {
    it('应该有正确的初始值', () => {
      const state = store.getState();

      expect(state.blocks).toEqual([]);
      expect(state.isDirty).toBe(false);
      expect(state.lastSyncedAt).toBeNull();
    });
  });

  describe('setBlocks', () => {
    it('应该正确设置块内容', () => {
      const mockBlocks = [
        { id: '1', type: 'paragraph', content: { text: '测试' } },
        { id: '2', type: 'heading', content: { text: '标题' } },
      ];

      store.getState().setBlocks(mockBlocks);

      const state = store.getState();
      expect(state.blocks).toEqual(mockBlocks);
      expect(state.isDirty).toBe(true);
    });

    it('设置空数组也应该标记为 dirty', () => {
      store.getState().setBlocks([{ id: '1', type: 'test', content: {} }]);
      store.getState().markSynced();
      store.getState().setBlocks([]);

      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('markDirty', () => {
    it('应该将 isDirty 设为 true', () => {
      expect(store.getState().isDirty).toBe(false);

      store.getState().markDirty();

      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('markSynced', () => {
    it('应该将 isDirty 设为 false 并更新同步时间', () => {
      store.getState().setBlocks([{ id: '1', type: 'test', content: {} }]);
      expect(store.getState().isDirty).toBe(true);

      const beforeSync = new Date();
      store.getState().markSynced();

      const state = store.getState();
      expect(state.isDirty).toBe(false);
      expect(state.lastSyncedAt).not.toBeNull();
      expect(state.lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeSync.getTime()
      );
    });
  });

  describe('reset', () => {
    it('应该重置所有状态', () => {
      store.getState().setBlocks([{ id: '1', type: 'test', content: {} }]);
      store.getState().markSynced();

      store.getState().reset();

      const state = store.getState();
      expect(state.blocks).toEqual([]);
      expect(state.isDirty).toBe(false);
      expect(state.lastSyncedAt).toBeNull();
    });
  });

  describe('addBlock', () => {
    it('应该添加新块', () => {
      const newBlock = { id: '1', type: 'scene', content: { order: 1 } };
      store.getState().addBlock(newBlock);

      expect(store.getState().blocks).toHaveLength(1);
      expect(store.getState().blocks[0]).toEqual(newBlock);
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('updateBlock', () => {
    it('应该更新指定块', () => {
      store.getState().setBlocks([
        { id: '1', type: 'scene', content: { status: 'pending' } },
      ]);

      store.getState().updateBlock('1', { content: { status: 'completed' } });

      expect(store.getState().blocks[0].content.status).toBe('completed');
    });
  });

  describe('removeBlock', () => {
    it('应该删除指定块', () => {
      store.getState().setBlocks([
        { id: '1', type: 'scene', content: {} },
        { id: '2', type: 'scene', content: {} },
      ]);

      store.getState().removeBlock('1');

      expect(store.getState().blocks).toHaveLength(1);
      expect(store.getState().blocks[0].id).toBe('2');
    });
  });
});
