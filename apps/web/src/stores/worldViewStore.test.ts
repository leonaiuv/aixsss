import { describe, it, expect, beforeEach } from 'vitest';
import { useWorldViewStore } from './worldViewStore';
import { WorldViewElement } from '@/types';

describe('worldViewStore', () => {
  beforeEach(() => {
    useWorldViewStore.setState({
      elements: [],
      currentElementId: null,
      isLoading: false,
    });
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have empty elements array', () => {
      const state = useWorldViewStore.getState();
      expect(state.elements).toEqual([]);
    });

    it('should have null currentElementId', () => {
      const state = useWorldViewStore.getState();
      expect(state.currentElementId).toBeNull();
    });

    it('should have isLoading as false', () => {
      const state = useWorldViewStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('loadElements', () => {
    it('should load elements from localStorage', () => {
      const mockElements: WorldViewElement[] = [
        {
          id: 'wv_1',
          projectId: 'proj_1',
          type: 'era',
          title: 'Medieval Era',
          content: 'A world set in medieval times',
          order: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      localStorage.setItem('aixs_worldview_proj_1', JSON.stringify(mockElements));

      const { loadElements } = useWorldViewStore.getState();
      loadElements('proj_1');

      expect(useWorldViewStore.getState().elements).toEqual(mockElements);
    });

    it('should set empty array if no elements stored', () => {
      const { loadElements } = useWorldViewStore.getState();
      loadElements('proj_1');

      expect(useWorldViewStore.getState().elements).toEqual([]);
    });

    it('should set isLoading during load', () => {
      const { loadElements } = useWorldViewStore.getState();
      loadElements('proj_1');

      // After load, isLoading should be false
      expect(useWorldViewStore.getState().isLoading).toBe(false);
    });

    it('should handle parse errors gracefully', () => {
      localStorage.setItem('aixs_worldview_proj_1', 'invalid json');

      const { loadElements } = useWorldViewStore.getState();

      expect(() => loadElements('proj_1')).not.toThrow();
      expect(useWorldViewStore.getState().isLoading).toBe(false);
    });
  });

  describe('addElement', () => {
    it('should add a new element with generated ID', () => {
      const elementData = {
        projectId: 'proj_1',
        type: 'era' as const,
        title: 'New Era',
        content: 'Content',
        order: 1,
      };

      const { addElement } = useWorldViewStore.getState();
      const newElement = addElement('proj_1', elementData);

      expect(newElement.id).toMatch(/^wv_/);
      expect(newElement.title).toBe('New Era');
    });

    it('should add element to elements array', () => {
      const { addElement } = useWorldViewStore.getState();
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: 'Test',
        content: '',
        order: 1,
      });

      expect(useWorldViewStore.getState().elements).toHaveLength(1);
    });

    it('should set timestamps on new element', () => {
      const { addElement } = useWorldViewStore.getState();
      const newElement = addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: 'Test',
        content: '',
        order: 1,
      });

      expect(newElement.createdAt).toBeDefined();
      expect(newElement.updatedAt).toBeDefined();
    });

    it('should save to localStorage', () => {
      const { addElement } = useWorldViewStore.getState();
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: 'Test',
        content: '',
        order: 1,
      });

      expect(localStorage.getItem('aixs_worldview_proj_1')).toBeDefined();
    });
  });

  describe('updateElement', () => {
    const existingElement: WorldViewElement = {
      id: 'wv_1',
      projectId: 'proj_1',
      type: 'era',
      title: 'Original',
      content: 'Original content',
      order: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      useWorldViewStore.setState({ elements: [existingElement] });
    });

    it('should update element properties', () => {
      const { updateElement } = useWorldViewStore.getState();
      updateElement('proj_1', 'wv_1', { title: 'Updated' });

      const updated = useWorldViewStore.getState().elements.find((e) => e.id === 'wv_1');
      expect(updated?.title).toBe('Updated');
    });

    it('should update updatedAt timestamp', () => {
      const { updateElement } = useWorldViewStore.getState();
      const beforeUpdate = new Date().toISOString();
      updateElement('proj_1', 'wv_1', { title: 'Updated' });

      const updated = useWorldViewStore.getState().elements.find((e) => e.id === 'wv_1');
      expect(updated?.updatedAt >= beforeUpdate).toBe(true);
    });

    it('should save to localStorage', () => {
      const { updateElement } = useWorldViewStore.getState();
      updateElement('proj_1', 'wv_1', { title: 'Updated' });

      expect(localStorage.getItem('aixs_worldview_proj_1')).toBeDefined();
    });

    it('should update content', () => {
      const { updateElement } = useWorldViewStore.getState();
      updateElement('proj_1', 'wv_1', { content: 'New content' });

      const updated = useWorldViewStore.getState().elements.find((e) => e.id === 'wv_1');
      expect(updated?.content).toBe('New content');
    });
  });

  describe('deleteElement', () => {
    const elements: WorldViewElement[] = [
      {
        id: 'wv_1',
        projectId: 'proj_1',
        type: 'era',
        title: 'Era 1',
        content: '',
        order: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'wv_2',
        projectId: 'proj_1',
        type: 'geography',
        title: 'Geography',
        content: '',
        order: 2,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      useWorldViewStore.setState({ elements });
    });

    it('should remove element from elements array', () => {
      const { deleteElement } = useWorldViewStore.getState();
      deleteElement('proj_1', 'wv_1');

      expect(useWorldViewStore.getState().elements).toHaveLength(1);
    });

    it('should save to localStorage', () => {
      const { deleteElement } = useWorldViewStore.getState();
      deleteElement('proj_1', 'wv_1');

      expect(localStorage.getItem('aixs_worldview_proj_1')).toBeDefined();
    });
  });

  describe('reorderElements', () => {
    const elements: WorldViewElement[] = [
      {
        id: 'wv_1',
        projectId: 'proj_1',
        type: 'era',
        title: 'Era 1',
        content: '',
        order: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'wv_2',
        projectId: 'proj_1',
        type: 'geography',
        title: 'Geography',
        content: '',
        order: 2,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'wv_3',
        projectId: 'proj_1',
        type: 'society',
        title: 'Society',
        content: '',
        order: 3,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      useWorldViewStore.setState({ elements });
    });

    it('should move element from one position to another', () => {
      const { reorderElements } = useWorldViewStore.getState();
      reorderElements('proj_1', 0, 2);

      const result = useWorldViewStore.getState().elements;
      expect(result[0].id).toBe('wv_2');
      expect(result[2].id).toBe('wv_1');
    });

    it('should update order numbers', () => {
      const { reorderElements } = useWorldViewStore.getState();
      reorderElements('proj_1', 2, 0);

      const result = useWorldViewStore.getState().elements;
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(3);
    });

    it('should save to localStorage', () => {
      const { reorderElements } = useWorldViewStore.getState();
      reorderElements('proj_1', 0, 1);

      expect(localStorage.getItem('aixs_worldview_proj_1')).toBeDefined();
    });
  });

  describe('setCurrentElement', () => {
    it('should set currentElementId', () => {
      const { setCurrentElement } = useWorldViewStore.getState();
      setCurrentElement('wv_1');

      expect(useWorldViewStore.getState().currentElementId).toBe('wv_1');
    });

    it('should set currentElementId to null', () => {
      useWorldViewStore.setState({ currentElementId: 'wv_1' });

      const { setCurrentElement } = useWorldViewStore.getState();
      setCurrentElement(null);

      expect(useWorldViewStore.getState().currentElementId).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle all element types', () => {
      const types: WorldViewElement['type'][] = [
        'era',
        'geography',
        'society',
        'technology',
        'magic',
        'custom',
      ];
      const { addElement } = useWorldViewStore.getState();

      types.forEach((type, index) => {
        addElement('proj_1', {
          projectId: 'proj_1',
          type,
          title: `Element ${index}`,
          content: '',
          order: index + 1,
        });
      });

      expect(useWorldViewStore.getState().elements).toHaveLength(6);
    });

    it('should handle multiple projects independently', () => {
      const { addElement, loadElements } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: 'Era 1',
        content: '',
        order: 1,
      });
      addElement('proj_2', {
        projectId: 'proj_2',
        type: 'era',
        title: 'Era 2',
        content: '',
        order: 1,
      });

      loadElements('proj_1');
      const proj1Elements = useWorldViewStore.getState().elements;

      loadElements('proj_2');
      const proj2Elements = useWorldViewStore.getState().elements;

      // Each project should have its own elements stored separately
      expect(localStorage.getItem('aixs_worldview_proj_1')).toBeDefined();
      expect(localStorage.getItem('aixs_worldview_proj_2')).toBeDefined();
    });
  });

  // ==========================================
  // P0-2: 世界观多选支持测试
  // ==========================================
  describe('世界观多选支持', () => {
    it('应该能够在同一类型下添加多个条目', () => {
      const { addElement } = useWorldViewStore.getState();

      // 添加多个“时代背景”类型的条目
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '中世纪时代',
        content: '封建社会',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '蒸汽朵克时代',
        content: '工业革命',
        order: 2,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '赛博朴克时代',
        content: '高科技低生活',
        order: 3,
      });

      expect(useWorldViewStore.getState().elements).toHaveLength(3);
      expect(useWorldViewStore.getState().elements.every((e) => e.type === 'era')).toBe(true);
    });

    it('应该能够按类型筛选世界观要素', () => {
      const { addElement, getElementsByType } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代1',
        content: '',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代2',
        content: '',
        order: 2,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'geography',
        title: '地理1',
        content: '',
        order: 3,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'society',
        title: '社会1',
        content: '',
        order: 4,
      });

      const eraElements = useWorldViewStore.getState().getElementsByType('era');
      expect(eraElements).toHaveLength(2);
      expect(eraElements.every((e) => e.type === 'era')).toBe(true);
    });

    it('按类型筛选不存在的类型应返回空数组', () => {
      const { addElement, getElementsByType } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代1',
        content: '',
        order: 1,
      });

      const magicElements = useWorldViewStore.getState().getElementsByType('magic');
      expect(magicElements).toHaveLength(0);
      expect(Array.isArray(magicElements)).toBe(true);
    });

    it('应该能够获取所有类型的分组数据', () => {
      const { addElement, getElementsByTypeGrouped } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代1',
        content: '',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代2',
        content: '',
        order: 2,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'geography',
        title: '地理1',
        content: '',
        order: 3,
      });

      const grouped = useWorldViewStore.getState().getElementsByTypeGrouped();

      expect(grouped.era).toHaveLength(2);
      expect(grouped.geography).toHaveLength(1);
      expect(grouped.society).toHaveLength(0);
      expect(grouped.technology).toHaveLength(0);
      expect(grouped.magic).toHaveLength(0);
      expect(grouped.custom).toHaveLength(0);
    });

    it('应该能够合并所有世界观要素为上下文字符串', () => {
      const { addElement, getWorldViewContext } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '中世纪',
        content: '封建社会，骑士与魔法并存',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'geography',
        title: '大陆',
        content: '广阔的大陆，有高山大海',
        order: 2,
      });

      const context = useWorldViewStore.getState().getWorldViewContext();

      expect(context).toContain('中世纪');
      expect(context).toContain('封建社会');
      expect(context).toContain('大陆');
      expect(context).toContain('广阔的大陆');
    });

    it('没有世界观要素时上下文应返回空字符串', () => {
      const { getWorldViewContext } = useWorldViewStore.getState();

      const context = useWorldViewStore.getState().getWorldViewContext();
      expect(context).toBe('');
    });

    it('应该能够独立编辑同类型下的不同条目', () => {
      const { addElement, updateElement } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代1',
        content: '原始内容',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代2',
        content: '原始内容',
        order: 2,
      });

      const elements = useWorldViewStore.getState().elements;
      const firstId = elements[0].id;

      updateElement('proj_1', firstId, { content: '更新后的内容' });

      const updated = useWorldViewStore.getState().elements;
      expect(updated[0].content).toBe('更新后的内容');
      expect(updated[1].content).toBe('原始内容');
    });

    it('应该能够独立删除同类型下的某一条目', () => {
      const { addElement, deleteElement } = useWorldViewStore.getState();

      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代1',
        content: '',
        order: 1,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代2',
        content: '',
        order: 2,
      });
      addElement('proj_1', {
        projectId: 'proj_1',
        type: 'era',
        title: '时代3',
        content: '',
        order: 3,
      });

      const elements = useWorldViewStore.getState().elements;
      const secondId = elements[1].id;

      deleteElement('proj_1', secondId);

      const remaining = useWorldViewStore.getState().elements;
      expect(remaining).toHaveLength(2);
      expect(remaining.find((e) => e.id === secondId)).toBeUndefined();
      expect(remaining[0].title).toBe('时代1');
      expect(remaining[1].title).toBe('时代3');
    });
  });
});
