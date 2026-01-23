/**
 * AgentCanvas 画布状态管理 Store
 * 基于 Zustand，支持撤销/重做、节点选择、弹窗编辑等功能
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AgentCanvasNodeV2,
  AgentCanvasEdgeV2,
  AgentCanvasViewportV2,
  AgentCanvasGraphV2,
  AgentCanvasNodeTypeV2,
  CanvasHistorySnapshot,
  NodeExecutionState,
} from '@/types/canvas';
import { generateEdgeId, createDefaultNode, getNodeLibraryItem } from '@/types/canvas';

// ==========================================
// 常量
// ==========================================

/** 最大历史记录数 */
const MAX_HISTORY = 50;

// ==========================================
// 类型定义
// ==========================================

interface CanvasState {
  // 项目关联
  projectId: string | null;

  // 画布数据
  nodes: AgentCanvasNodeV2[];
  edges: AgentCanvasEdgeV2[];
  viewport: AgentCanvasViewportV2;

  // 分组
  groups: Array<{ id: string; name: string; color?: string; collapsed?: boolean }>;

  // 选择状态
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;

  // 编辑状态
  editingNodeId: string | null;
  isDialogOpen: boolean;

  // 历史记录 (撤销/重做)
  past: CanvasHistorySnapshot[];
  future: CanvasHistorySnapshot[];

  // 执行状态
  runningNodeIds: Set<string>;

  // 加载状态
  isInitialized: boolean;
  isDirty: boolean;
}

interface CanvasActions {
  // 初始化
  initialize(projectId: string, graph: AgentCanvasGraphV2 | null): void;
  reset(): void;

  // 节点操作
  addNode(type: AgentCanvasNodeTypeV2, position?: { x: number; y: number }): string;
  updateNode(id: string, updates: Partial<AgentCanvasNodeV2>): void;
  updateNodeData(id: string, data: Record<string, unknown>): void;
  deleteNode(id: string): void;
  deleteSelectedNodes(): void;
  setNodeState(id: string, state: NodeExecutionState, error?: string): void;
  setNodeProgress(id: string, progress: number): void;

  // 边操作
  addEdge(edge: Omit<AgentCanvasEdgeV2, 'id'>): string;
  deleteEdge(id: string): void;
  setEdgeAnimated(id: string, animated: boolean): void;

  // 批量操作
  setNodes(nodes: AgentCanvasNodeV2[]): void;
  setEdges(edges: AgentCanvasEdgeV2[]): void;

  // 视口操作
  setViewport(viewport: AgentCanvasViewportV2): void;

  // 选择操作
  selectNode(id: string, append?: boolean): void;
  selectEdge(id: string, append?: boolean): void;
  selectAll(): void;
  clearSelection(): void;
  toggleNodeSelection(id: string): void;

  // 弹窗编辑
  openNodeDialog(id: string): void;
  closeNodeDialog(): void;

  // 历史操作 (撤销/重做)
  undo(): void;
  redo(): void;
  pushHistory(label?: string): void;

  // 执行状态
  setNodeRunning(id: string, running: boolean): void;

  // 导出
  toGraph(): AgentCanvasGraphV2;

  // 标记脏状态
  markDirty(): void;
  markClean(): void;
}

export type CanvasStore = CanvasState & CanvasActions;

// ==========================================
// 辅助函数
// ==========================================

/**
 * 创建历史快照
 */
function createSnapshot(state: CanvasState, label: string): CanvasHistorySnapshot {
  return {
    id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    label,
    nodes: structuredClone(state.nodes),
    edges: structuredClone(state.edges),
  };
}

/**
 * 创建默认视口
 */
function createDefaultViewport(): AgentCanvasViewportV2 {
  return { x: 0, y: 0, zoom: 1 };
}

/**
 * 创建默认状态
 */
function createDefaultState(): CanvasState {
  return {
    projectId: null,
    nodes: [],
    edges: [],
    viewport: createDefaultViewport(),
    groups: [],
    selectedNodeIds: new Set(),
    selectedEdgeIds: new Set(),
    editingNodeId: null,
    isDialogOpen: false,
    past: [],
    future: [],
    runningNodeIds: new Set(),
    isInitialized: false,
    isDirty: false,
  };
}

// ==========================================
// Store 创建
// ==========================================

export const useCanvasStore = create<CanvasStore>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    ...createDefaultState(),

    // ==========================================
    // 初始化
    // ==========================================

    initialize: (projectId, graph) => {
      const defaultNodes: AgentCanvasNodeV2[] = [];
      const defaultEdges: AgentCanvasEdgeV2[] = [];

      if (graph && graph.version === 2) {
        set({
          projectId,
          nodes: graph.nodes ?? [],
          edges: graph.edges ?? [],
          viewport: graph.viewport ?? createDefaultViewport(),
          groups: graph.groups ?? [],
          selectedNodeIds: new Set(),
          selectedEdgeIds: new Set(),
          editingNodeId: null,
          isDialogOpen: false,
          past: [],
          future: [],
          runningNodeIds: new Set(),
          isInitialized: true,
          isDirty: false,
        });
      } else {
        // 没有数据或版本不匹配，使用空画布
        set({
          ...createDefaultState(),
          projectId,
          nodes: defaultNodes,
          edges: defaultEdges,
          isInitialized: true,
        });
      }
    },

    reset: () => {
      set(createDefaultState());
    },

    // ==========================================
    // 节点操作
    // ==========================================

    addNode: (type, position) => {
      const state = get();
      const pos = position ?? { x: 100, y: 100 };
      const node = createDefaultNode(type, pos);

      // 记录历史
      const snapshot = createSnapshot(
        state,
        `添加节点: ${getNodeLibraryItem(type)?.label ?? type}`,
      );

      set({
        nodes: [...state.nodes, node],
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
        isDirty: true,
      });

      return node.id;
    },

    updateNode: (id, updates) => {
      const state = get();
      const nodeIndex = state.nodes.findIndex((n) => n.id === id);
      if (nodeIndex === -1) return;

      const updatedNodes = [...state.nodes];
      updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], ...updates };

      set({
        nodes: updatedNodes,
        isDirty: true,
      });
    },

    updateNodeData: (id, data) => {
      const state = get();
      const nodeIndex = state.nodes.findIndex((n) => n.id === id);
      if (nodeIndex === -1) return;

      const updatedNodes = [...state.nodes];
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        data: { ...updatedNodes[nodeIndex].data, ...data },
      };

      set({
        nodes: updatedNodes,
        isDirty: true,
      });
    },

    deleteNode: (id) => {
      const state = get();
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return;

      // 记录历史
      const snapshot = createSnapshot(
        state,
        `删除节点: ${(node.data as { label?: string })?.label ?? node.type}`,
      );

      // 删除节点及其关联的边
      const newNodes = state.nodes.filter((n) => n.id !== id);
      const newEdges = state.edges.filter((e) => e.source !== id && e.target !== id);
      const newSelectedNodeIds = new Set(state.selectedNodeIds);
      newSelectedNodeIds.delete(id);

      set({
        nodes: newNodes,
        edges: newEdges,
        selectedNodeIds: newSelectedNodeIds,
        editingNodeId: state.editingNodeId === id ? null : state.editingNodeId,
        isDialogOpen: state.editingNodeId === id ? false : state.isDialogOpen,
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
        isDirty: true,
      });
    },

    deleteSelectedNodes: () => {
      const state = get();
      if (state.selectedNodeIds.size === 0) return;

      // 记录历史
      const snapshot = createSnapshot(state, `删除 ${state.selectedNodeIds.size} 个节点`);

      const newNodes = state.nodes.filter((n) => !state.selectedNodeIds.has(n.id));
      const newEdges = state.edges.filter(
        (e) => !state.selectedNodeIds.has(e.source) && !state.selectedNodeIds.has(e.target),
      );

      set({
        nodes: newNodes,
        edges: newEdges,
        selectedNodeIds: new Set(),
        editingNodeId: null,
        isDialogOpen: false,
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
        isDirty: true,
      });
    },

    setNodeState: (id, nodeState, error) => {
      const state = get();
      const nodeIndex = state.nodes.findIndex((n) => n.id === id);
      if (nodeIndex === -1) return;

      const updatedNodes = [...state.nodes];
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        state: nodeState,
        lastError: error,
        lastRunAt:
          nodeState === 'success' || nodeState === 'error'
            ? new Date().toISOString()
            : updatedNodes[nodeIndex].lastRunAt,
      };

      set({
        nodes: updatedNodes,
        isDirty: true,
      });
    },

    setNodeProgress: (id, progress) => {
      const state = get();
      const nodeIndex = state.nodes.findIndex((n) => n.id === id);
      if (nodeIndex === -1) return;

      const updatedNodes = [...state.nodes];
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        progress,
      };

      set({ nodes: updatedNodes });
    },

    // ==========================================
    // 边操作
    // ==========================================

    addEdge: (edge) => {
      const state = get();
      const edgeId = generateEdgeId();
      const newEdge: AgentCanvasEdgeV2 = { id: edgeId, ...edge };

      // 检查是否已存在相同的边
      const exists = state.edges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          e.sourceHandle === edge.sourceHandle &&
          e.targetHandle === edge.targetHandle,
      );
      if (exists) return '';

      // 记录历史
      const snapshot = createSnapshot(state, '添加连接');

      set({
        edges: [...state.edges, newEdge],
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
        isDirty: true,
      });

      return edgeId;
    },

    deleteEdge: (id) => {
      const state = get();
      const edge = state.edges.find((e) => e.id === id);
      if (!edge) return;

      // 记录历史
      const snapshot = createSnapshot(state, '删除连接');

      set({
        edges: state.edges.filter((e) => e.id !== id),
        selectedEdgeIds: new Set([...state.selectedEdgeIds].filter((eId) => eId !== id)),
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
        isDirty: true,
      });
    },

    setEdgeAnimated: (id, animated) => {
      const state = get();
      const edgeIndex = state.edges.findIndex((e) => e.id === id);
      if (edgeIndex === -1) return;

      const updatedEdges = [...state.edges];
      updatedEdges[edgeIndex] = { ...updatedEdges[edgeIndex], animated };

      set({ edges: updatedEdges });
    },

    // ==========================================
    // 批量操作
    // ==========================================

    setNodes: (nodes) => {
      set({ nodes, isDirty: true });
    },

    setEdges: (edges) => {
      set({ edges, isDirty: true });
    },

    // ==========================================
    // 视口操作
    // ==========================================

    setViewport: (viewport) => {
      set({ viewport, isDirty: true });
    },

    // ==========================================
    // 选择操作
    // ==========================================

    selectNode: (id, append = false) => {
      const state = get();
      if (append) {
        const newSelected = new Set(state.selectedNodeIds);
        newSelected.add(id);
        set({ selectedNodeIds: newSelected, selectedEdgeIds: new Set() });
      } else {
        set({ selectedNodeIds: new Set([id]), selectedEdgeIds: new Set() });
      }
    },

    selectEdge: (id, append = false) => {
      const state = get();
      if (append) {
        const newSelected = new Set(state.selectedEdgeIds);
        newSelected.add(id);
        set({ selectedEdgeIds: newSelected, selectedNodeIds: new Set() });
      } else {
        set({ selectedEdgeIds: new Set([id]), selectedNodeIds: new Set() });
      }
    },

    selectAll: () => {
      const state = get();
      set({
        selectedNodeIds: new Set(state.nodes.map((n) => n.id)),
        selectedEdgeIds: new Set(state.edges.map((e) => e.id)),
      });
    },

    clearSelection: () => {
      set({ selectedNodeIds: new Set(), selectedEdgeIds: new Set() });
    },

    toggleNodeSelection: (id) => {
      const state = get();
      const newSelected = new Set(state.selectedNodeIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      set({ selectedNodeIds: newSelected });
    },

    // ==========================================
    // 弹窗编辑
    // ==========================================

    openNodeDialog: (id) => {
      set({ editingNodeId: id, isDialogOpen: true });
    },

    closeNodeDialog: () => {
      set({ editingNodeId: null, isDialogOpen: false });
    },

    // ==========================================
    // 历史操作 (撤销/重做)
    // ==========================================

    undo: () => {
      const state = get();
      if (state.past.length === 0) return;

      const previous = state.past[state.past.length - 1];
      const currentSnapshot = createSnapshot(state, 'current');

      set({
        nodes: previous.nodes,
        edges: previous.edges,
        past: state.past.slice(0, -1),
        future: [currentSnapshot, ...state.future],
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set(),
        isDirty: true,
      });
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;

      const next = state.future[0];
      const currentSnapshot = createSnapshot(state, 'current');

      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...state.past, currentSnapshot],
        future: state.future.slice(1),
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set(),
        isDirty: true,
      });
    },

    pushHistory: (label = 'edit') => {
      const state = get();
      const snapshot = createSnapshot(state, label);
      set({
        past: [...state.past.slice(-MAX_HISTORY + 1), snapshot],
        future: [],
      });
    },

    // ==========================================
    // 执行状态
    // ==========================================

    setNodeRunning: (id, running) => {
      const state = get();
      const newRunning = new Set(state.runningNodeIds);
      if (running) {
        newRunning.add(id);
      } else {
        newRunning.delete(id);
      }
      set({ runningNodeIds: newRunning });
    },

    // ==========================================
    // 导出
    // ==========================================

    toGraph: (): AgentCanvasGraphV2 => {
      const state = get();
      return {
        version: 2,
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        groups: state.groups.length > 0 ? state.groups : undefined,
      };
    },

    // ==========================================
    // 脏状态
    // ==========================================

    markDirty: () => {
      set({ isDirty: true });
    },

    markClean: () => {
      set({ isDirty: false });
    },
  })),
);

// ==========================================
// 选择器
// ==========================================

/** 是否可以撤销 */
export const selectCanUndo = (state: CanvasStore) => state.past.length > 0;

/** 是否可以重做 */
export const selectCanRedo = (state: CanvasStore) => state.future.length > 0;

/** 获取当前编辑的节点 */
export const selectEditingNode = (state: CanvasStore) =>
  state.editingNodeId ? state.nodes.find((n) => n.id === state.editingNodeId) : null;

/** 获取选中的节点 */
export const selectSelectedNodes = (state: CanvasStore) =>
  state.nodes.filter((n) => state.selectedNodeIds.has(n.id));

/** 获取选中的边 */
export const selectSelectedEdges = (state: CanvasStore) =>
  state.edges.filter((e) => state.selectedEdgeIds.has(e.id));

/** 获取正在运行的节点 */
export const selectRunningNodes = (state: CanvasStore) =>
  state.nodes.filter((n) => state.runningNodeIds.has(n.id));

/** 获取节点的依赖节点 (入边的源节点) */
export const selectNodeDependencies = (nodeId: string) => (state: CanvasStore) => {
  const incomingEdges = state.edges.filter((e) => e.target === nodeId);
  const sourceIds = incomingEdges.map((e) => e.source);
  return state.nodes.filter((n) => sourceIds.includes(n.id));
};

/** 获取节点的下游节点 (出边的目标节点) */
export const selectNodeDependents = (nodeId: string) => (state: CanvasStore) => {
  const outgoingEdges = state.edges.filter((e) => e.source === nodeId);
  const targetIds = outgoingEdges.map((e) => e.target);
  return state.nodes.filter((n) => targetIds.includes(n.id));
};
