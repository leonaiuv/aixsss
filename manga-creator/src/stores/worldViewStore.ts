import { create } from 'zustand';
import { WorldViewElement } from '@/types';

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
}));

function saveElements(projectId: string, elements: WorldViewElement[]) {
  try {
    localStorage.setItem(`aixs_worldview_${projectId}`, JSON.stringify(elements));
  } catch (error) {
    console.error('Failed to save world view elements:', error);
  }
}
