import { create } from 'zustand';

// =====================
// Block 类型 (简化定义，与 BlockNote 兼容)
// =====================
export interface Block {
  id: string;
  type?: string;
  [key: string]: unknown;
}

// =====================
// 画布块类型 (用于 Agent 同步)
// =====================
export interface CanvasBlock {
  id: string;
  type: 'project' | 'scene' | 'export' | string;
  content: Record<string, unknown>;
}

// =====================
// Store 接口定义
// =====================
export interface CanvasState {
  // 画布内容
  blocks: CanvasBlock[];
  isDirty: boolean;
  lastSyncedAt: Date | null;

  // Actions
  setBlocks: (blocks: CanvasBlock[]) => void;
  addBlock: (block: CanvasBlock) => void;
  updateBlock: (id: string, updates: Partial<CanvasBlock>) => void;
  removeBlock: (id: string) => void;
  markDirty: () => void;
  markSynced: () => void;
  reset: () => void;
}

// =====================
// 初始状态
// =====================
const initialState = {
  blocks: [] as CanvasBlock[],
  isDirty: false,
  lastSyncedAt: null as Date | null,
};

// =====================
// 创建 Store
// =====================
export const useCanvasStore = create<CanvasState>((set) => ({
  ...initialState,

  setBlocks: (blocks) => set({ blocks, isDirty: true }),

  addBlock: (block) =>
    set((state) => ({
      blocks: [...state.blocks, block],
      isDirty: true,
    })),

  updateBlock: (id, updates) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === id
          ? {
              ...b,
              ...updates,
              content: { ...b.content, ...updates.content },
            }
          : b
      ),
      isDirty: true,
    })),

  removeBlock: (id) =>
    set((state) => ({
      blocks: state.blocks.filter((b) => b.id !== id),
      isDirty: true,
    })),

  markDirty: () => set({ isDirty: true }),

  markSynced: () => set({ isDirty: false, lastSyncedAt: new Date() }),

  reset: () => set(initialState),
}));
