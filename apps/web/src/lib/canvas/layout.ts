/**
 * 画布自动布局算法
 * 使用简单的层级布局算法实现 DAG 自动排列
 */

import type { AgentCanvasNodeV2, AgentCanvasEdgeV2 } from '@/types/canvas';

// ==========================================
// 配置
// ==========================================

/** 布局配置 */
export interface LayoutConfig {
  /** 节点水平间距 */
  nodeSpacingX: number;
  /** 节点垂直间距 */
  nodeSpacingY: number;
  /** 布局方向 */
  direction: 'LR' | 'TB';
  /** 默认节点宽度 */
  nodeWidth: number;
  /** 默认节点高度 */
  nodeHeight: number;
}

/** 默认布局配置 */
const DEFAULT_CONFIG: LayoutConfig = {
  nodeSpacingX: 250,
  nodeSpacingY: 100,
  direction: 'LR',
  nodeWidth: 200,
  nodeHeight: 80,
};

// ==========================================
// 拓扑排序
// ==========================================

/**
 * 拓扑排序，返回层级分组
 */
function topologicalSort(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): Map<string, number> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const levels = new Map<string, number>();

  // 初始化
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // 构建邻接表和入度
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // 找出所有入度为 0 的节点
  const queue: Array<{ id: string; level: number }> = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      queue.push({ id: node.id, level: 0 });
      levels.set(node.id, 0);
    }
  }

  // BFS 遍历
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current.id) ?? [];

    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);

      const newLevel = current.level + 1;
      const existingLevel = levels.get(neighbor);

      if (existingLevel === undefined || newLevel > existingLevel) {
        levels.set(neighbor, newLevel);
      }

      if (newDegree === 0) {
        queue.push({ id: neighbor, level: levels.get(neighbor)! });
      }
    }
  }

  // 处理孤立节点（无边连接）
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  }

  return levels;
}

// ==========================================
// 布局计算
// ==========================================

/**
 * 计算节点布局位置
 */
export function calculateLayout(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
  config: Partial<LayoutConfig> = {},
): Map<string, { x: number; y: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) return positions;

  // 获取层级
  const levels = topologicalSort(nodes, edges);

  // 按层级分组
  const levelGroups = new Map<number, AgentCanvasNodeV2[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    const group = levelGroups.get(level) ?? [];
    group.push(node);
    levelGroups.set(level, group);
  }

  // 计算位置
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const group = levelGroups.get(level) ?? [];
    const count = group.length;

    for (let i = 0; i < count; i++) {
      const node = group[i];
      let x: number, y: number;

      if (cfg.direction === 'LR') {
        // 从左到右布局
        x = level * (cfg.nodeWidth + cfg.nodeSpacingX);
        y =
          i * (cfg.nodeHeight + cfg.nodeSpacingY) -
          ((count - 1) * (cfg.nodeHeight + cfg.nodeSpacingY)) / 2;
      } else {
        // 从上到下布局
        x =
          i * (cfg.nodeWidth + cfg.nodeSpacingX) -
          ((count - 1) * (cfg.nodeWidth + cfg.nodeSpacingX)) / 2;
        y = level * (cfg.nodeHeight + cfg.nodeSpacingY);
      }

      positions.set(node.id, { x, y });
    }
  }

  return positions;
}

/**
 * 应用布局到节点
 */
export function applyLayout(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
  config: Partial<LayoutConfig> = {},
): AgentCanvasNodeV2[] {
  const positions = calculateLayout(nodes, edges, config);

  return nodes.map((node) => {
    const pos = positions.get(node.id);
    if (pos) {
      return { ...node, position: pos };
    }
    return node;
  });
}

// ==========================================
// 对齐工具
// ==========================================

/**
 * 水平对齐选中的节点
 */
export function alignNodesHorizontally(nodes: AgentCanvasNodeV2[]): AgentCanvasNodeV2[] {
  if (nodes.length < 2) return nodes;

  // 计算平均 Y 坐标
  const avgY = nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length;

  return nodes.map((node) => ({
    ...node,
    position: { ...node.position, y: avgY },
  }));
}

/**
 * 垂直对齐选中的节点
 */
export function alignNodesVertically(nodes: AgentCanvasNodeV2[]): AgentCanvasNodeV2[] {
  if (nodes.length < 2) return nodes;

  // 计算平均 X 坐标
  const avgX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;

  return nodes.map((node) => ({
    ...node,
    position: { ...node.position, x: avgX },
  }));
}

/**
 * 均匀分布选中的节点（水平）
 */
export function distributeNodesHorizontally(nodes: AgentCanvasNodeV2[]): AgentCanvasNodeV2[] {
  if (nodes.length < 3) return nodes;

  // 按 X 坐标排序
  const sorted = [...nodes].sort((a, b) => a.position.x - b.position.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalWidth = last.position.x - first.position.x;
  const spacing = totalWidth / (sorted.length - 1);

  return sorted.map((node, index) => ({
    ...node,
    position: { ...node.position, x: first.position.x + spacing * index },
  }));
}

/**
 * 均匀分布选中的节点（垂直）
 */
export function distributeNodesVertically(nodes: AgentCanvasNodeV2[]): AgentCanvasNodeV2[] {
  if (nodes.length < 3) return nodes;

  // 按 Y 坐标排序
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalHeight = last.position.y - first.position.y;
  const spacing = totalHeight / (sorted.length - 1);

  return sorted.map((node, index) => ({
    ...node,
    position: { ...node.position, y: first.position.y + spacing * index },
  }));
}
