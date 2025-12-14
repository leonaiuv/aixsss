import { describe, expect, it } from 'vitest';
import { reducer } from '@/hooks/use-toast';

// ==========================================
// Toast Reducer 测试
// ==========================================

describe('Toast Reducer', () => {
  const createTestToast = (id: string, title?: string) => ({
    id,
    title: title || `Toast ${id}`,
    open: true,
    onOpenChange: () => {},
  });

  describe('ADD_TOAST', () => {
    it('应添加新的 toast', () => {
      const state = { toasts: [] };
      const newToast = createTestToast('1', 'New Toast');

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('1');
      expect(result.toasts[0].title).toBe('New Toast');
    });

    it('应将新 toast 添加到列表开头', () => {
      const existingToast = createTestToast('1', 'Existing');
      const state = { toasts: [existingToast] };
      const newToast = createTestToast('2', 'New');

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      expect(result.toasts[0].id).toBe('2');
    });

    it('应限制 toast 数量为 TOAST_LIMIT', () => {
      const state = { toasts: [createTestToast('1')] };
      const newToast = createTestToast('2', 'New');

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast: newToast,
      });

      // TOAST_LIMIT 为 1，所以只保留最新的
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });
  });

  describe('UPDATE_TOAST', () => {
    it('应更新指定 toast', () => {
      const state = { toasts: [createTestToast('1', 'Original')] };

      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Updated');
    });

    it('不匹配的 ID 不应更新任何 toast', () => {
      const state = { toasts: [createTestToast('1', 'Original')] };

      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '2', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Original');
    });

    it('应保留未更新的属性', () => {
      const state = {
        toasts: [
          {
            ...createTestToast('1', 'Original'),
            description: 'Original Description',
          },
        ],
      };

      const result = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(result.toasts[0].title).toBe('Updated');
      expect(result.toasts[0].description).toBe('Original Description');
    });
  });

  describe('DISMISS_TOAST', () => {
    it('应将指定 toast 的 open 设为 false', () => {
      const state = { toasts: [createTestToast('1')] };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(result.toasts[0].open).toBe(false);
    });

    it('无 toastId 时应关闭所有 toast', () => {
      const state = {
        toasts: [createTestToast('1'), createTestToast('2')],
      };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
      });

      expect(result.toasts[0].open).toBe(false);
      expect(result.toasts[1].open).toBe(false);
    });

    it('应只关闭匹配的 toast', () => {
      const toast1 = createTestToast('1');
      const toast2 = createTestToast('2');
      const state = { toasts: [toast1, toast2] };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(result.toasts[0].open).toBe(false);
      expect(result.toasts[1].open).toBe(true);
    });
  });

  describe('REMOVE_TOAST', () => {
    it('应移除指定 toast', () => {
      const state = {
        toasts: [createTestToast('1'), createTestToast('2')],
      };

      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe('2');
    });

    it('无 toastId 时应移除所有 toast', () => {
      const state = {
        toasts: [createTestToast('1'), createTestToast('2')],
      };

      const result = reducer(state, {
        type: 'REMOVE_TOAST',
      });

      expect(result.toasts).toHaveLength(0);
    });

    it('移除不存在的 toast 应保持状态不变', () => {
      const state = { toasts: [createTestToast('1')] };

      const result = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: 'non-existent',
      });

      expect(result.toasts).toHaveLength(1);
    });
  });

  describe('边界情况', () => {
    it('应处理空 toasts 数组', () => {
      const state = { toasts: [] };

      const result = reducer(state, {
        type: 'DISMISS_TOAST',
      });

      expect(result.toasts).toHaveLength(0);
    });

    it('应处理带有所有属性的 toast', () => {
      const state = { toasts: [] };
      const fullToast = {
        id: '1',
        title: 'Title',
        description: 'Description',
        variant: 'default' as const,
        open: true,
        onOpenChange: () => {},
      };

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast: fullToast,
      });

      expect(result.toasts[0]).toMatchObject({
        id: '1',
        title: 'Title',
        description: 'Description',
        variant: 'default',
      });
    });

    it('应处理 destructive variant', () => {
      const state = { toasts: [] };
      const toast = {
        id: '1',
        title: 'Error',
        variant: 'destructive' as const,
        open: true,
        onOpenChange: () => {},
      };

      const result = reducer(state, {
        type: 'ADD_TOAST',
        toast,
      });

      expect(result.toasts[0].variant).toBe('destructive');
    });
  });

  describe('状态不可变性', () => {
    it('ADD_TOAST 不应修改原始状态', () => {
      const originalState = { toasts: [] };
      const originalRef = originalState.toasts;

      reducer(originalState, {
        type: 'ADD_TOAST',
        toast: createTestToast('1'),
      });

      expect(originalState.toasts).toBe(originalRef);
      expect(originalState.toasts).toHaveLength(0);
    });

    it('UPDATE_TOAST 不应修改原始状态', () => {
      const originalToast = createTestToast('1', 'Original');
      const originalState = { toasts: [originalToast] };

      reducer(originalState, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated' },
      });

      expect(originalState.toasts[0].title).toBe('Original');
    });

    it('REMOVE_TOAST 不应修改原始状态', () => {
      const originalState = { toasts: [createTestToast('1')] };
      const originalLength = originalState.toasts.length;

      reducer(originalState, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(originalState.toasts.length).toBe(originalLength);
    });
  });
});
