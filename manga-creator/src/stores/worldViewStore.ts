import { create } from 'zustand';
import { WorldViewElement } from '@/types';

/** 世界观要素类型 */
type WorldViewType = WorldViewElement['type'];

/** 按类型分组的世界观要素 */
interface WorldViewGrouped {
  era: WorldViewElement[];
  geography: WorldViewElement[];
  society: WorldViewElement[];
  technology: WorldViewElement[];
  magic: WorldViewElement[];
  custom: WorldViewElement[];
}

interface WorldViewStore {
  elements: WorldViewElement[];
  currentElementId: string | null;
  isLoading: boolean;
  
  // 操作方法
  loadElements: (projectId: string) => void;
  addElement: (projectId: string, element: Omit<WorldViewElement, 'id' | 'createdAt' | 'updatedAt'>) => WorldViewElement;
  updateElement: (projectId: string, elementId: string, updates: Partial<WorldViewElement>) => void;
  deleteElement: (projectId: string, elementId: string) => void;
  reorderElements: (projectId: string, fromIndex: number, toIndex: number) => void;
  setCurrentElement: (elementId: string | null) => void;
  
  // P0-2: 世界观多选支持 - 新增方法
  /** 按类型筛选世界观要素 */
  getElementsByType: (type: WorldViewType) => WorldViewElement[];
  /** 获取所有类型的分组数据 */
  getElementsByTypeGrouped: () => WorldViewGrouped;
  /** 合并所有世界观要素为上下文字符串，用于AI注入 */
  getWorldViewContext: () => string;
}

export const useWorldViewStore = create<WorldViewStore>((set, get) => ({
  elements: [],
  currentElementId: null,
  isLoading: false,
  
  loadElements: (projectId: string) => {
    set({ isLoading: true });
    try {
      const stored = localStorage.getItem(`aixs_worldview_${projectId}`);
      const elements = stored ? JSON.parse(stored) : [];
      set({ elements, isLoading: false });
    } catch (error) {
      console.error('Failed to load world view elements:', error);
      set({ isLoading: false });
    }
  },
  
  addElement: (projectId: string, elementData) => {
    const now = new Date().toISOString();
    const newElement: WorldViewElement = {
      ...elementData,
      id: `wv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };
    
    const elements = [...get().elements, newElement];
    set({ elements });
    saveElements(projectId, elements);
    
    return newElement;
  },
  
  updateElement: (projectId: string, elementId: string, updates: Partial<WorldViewElement>) => {
    const elements = get().elements;
    const updated = elements.map(el =>
      el.id === elementId
        ? { ...el, ...updates, updatedAt: new Date().toISOString() }
        : el
    );
    
    set({ elements: updated });
    saveElements(projectId, updated);
  },
  
  deleteElement: (projectId: string, elementId: string) => {
    const elements = get().elements.filter(el => el.id !== elementId);
    set({ elements });
    saveElements(projectId, elements);
  },
  
  reorderElements: (projectId: string, fromIndex: number, toIndex: number) => {
    const elements = [...get().elements];
    const [movedElement] = elements.splice(fromIndex, 1);
    elements.splice(toIndex, 0, movedElement);
    
    // 重新编号
    const reordered = elements.map((el, index) => ({
      ...el,
      order: index + 1,
    }));
    
    set({ elements: reordered });
    saveElements(projectId, reordered);
  },
  
  setCurrentElement: (elementId: string | null) => {
    set({ currentElementId: elementId });
  },
  
  // P0-2: 世界观多选支持 - 新增方法
  getElementsByType: (type: WorldViewType) => {
    return get().elements.filter(el => el.type === type);
  },
  
  getElementsByTypeGrouped: () => {
    const elements = get().elements;
    return {
      era: elements.filter(el => el.type === 'era'),
      geography: elements.filter(el => el.type === 'geography'),
      society: elements.filter(el => el.type === 'society'),
      technology: elements.filter(el => el.type === 'technology'),
      magic: elements.filter(el => el.type === 'magic'),
      custom: elements.filter(el => el.type === 'custom'),
    };
  },
  
  getWorldViewContext: () => {
    const elements = get().elements;
    if (elements.length === 0) return '';
    
    const typeLabels: Record<WorldViewType, string> = {
      era: '时代背景',
      geography: '地理设定',
      society: '社会制度',
      technology: '科技水平',
      magic: '魔法体系',
      custom: '其他设定',
    };
    
    // 按类型分组并格式化
    const grouped = get().getElementsByTypeGrouped();
    const contextParts: string[] = [];
    
    (Object.keys(grouped) as WorldViewType[]).forEach(type => {
      const items = grouped[type];
      if (items.length > 0) {
        const label = typeLabels[type];
        const content = items.map(el => `【${el.title}】${el.content}`).join('\n');
        contextParts.push(`## ${label}\n${content}`);
      }
    });
    
    return contextParts.join('\n\n');
  },
}));

function saveElements(projectId: string, elements: WorldViewElement[]) {
  try {
    localStorage.setItem(`aixs_worldview_${projectId}`, JSON.stringify(elements));
  } catch (error) {
    console.error('Failed to save world view elements:', error);
  }
}
