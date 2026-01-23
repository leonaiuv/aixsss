/**
 * 画布节点验证逻辑
 * 验证节点间依赖关系、检测循环依赖等
 */

import type { AgentCanvasNodeV2, AgentCanvasEdgeV2, NodeExecutionState } from '@/types/canvas';

// ==========================================
// 依赖验证
// ==========================================

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'cycle' | 'missing_dependency' | 'invalid_edge';
  message: string;
  nodeIds?: string[];
  edgeId?: string;
}

export interface ValidationWarning {
  type: 'orphan_node' | 'stale_data' | 'incomplete_dependency';
  message: string;
  nodeIds?: string[];
}

/**
 * 检测循环依赖
 */
export function detectCycles(nodes: AgentCanvasNodeV2[], edges: AgentCanvasEdgeV2[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();
  const cycles: string[][] = [];

  // 构建邻接表
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  // DFS 检测循环
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        // 找到循环
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycle.push(neighbor); // 闭合循环
        cycles.push(cycle);
        return true;
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * 检测孤立节点（无入边也无出边）
 */
export function detectOrphanNodes(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): string[] {
  const connectedNodes = new Set<string>();

  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }

  return nodes.filter((n) => !connectedNodes.has(n.id)).map((n) => n.id);
}

/**
 * 检测悬空边（指向不存在的节点）
 */
export function detectInvalidEdges(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target)).map((e) => e.id);
}

/**
 * 验证画布
 */
export function validateCanvas(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 检测循环依赖
  const cycles = detectCycles(nodes, edges);
  for (const cycle of cycles) {
    errors.push({
      type: 'cycle',
      message: `检测到循环依赖: ${cycle.join(' -> ')}`,
      nodeIds: cycle,
    });
  }

  // 检测无效边
  const invalidEdges = detectInvalidEdges(nodes, edges);
  for (const edgeId of invalidEdges) {
    errors.push({
      type: 'invalid_edge',
      message: `边 ${edgeId} 连接了不存在的节点`,
      edgeId,
    });
  }

  // 检测孤立节点（警告）
  const orphans = detectOrphanNodes(nodes, edges);
  if (orphans.length > 0) {
    warnings.push({
      type: 'orphan_node',
      message: `存在 ${orphans.length} 个孤立节点`,
      nodeIds: orphans,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ==========================================
// 依赖状态检查
// ==========================================

/**
 * 获取节点的所有依赖（入边的源节点）
 */
export function getNodeDependencies(
  nodeId: string,
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): AgentCanvasNodeV2[] {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const sourceIds = new Set(incomingEdges.map((e) => e.source));
  return nodes.filter((n) => sourceIds.has(n.id));
}

/**
 * 获取节点的所有下游节点（出边的目标节点）
 */
export function getNodeDependents(
  nodeId: string,
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): AgentCanvasNodeV2[] {
  const outgoingEdges = edges.filter((e) => e.source === nodeId);
  const targetIds = new Set(outgoingEdges.map((e) => e.target));
  return nodes.filter((n) => targetIds.has(n.id));
}

/**
 * 检查节点的依赖是否都已完成
 */
export function checkDependenciesReady(
  nodeId: string,
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): { ready: boolean; pendingDependencies: string[] } {
  const dependencies = getNodeDependencies(nodeId, nodes, edges);
  const pendingDependencies: string[] = [];

  for (const dep of dependencies) {
    if (dep.state !== 'success') {
      pendingDependencies.push(dep.id);
    }
  }

  return {
    ready: pendingDependencies.length === 0,
    pendingDependencies,
  };
}

/**
 * 计算节点的执行状态（基于依赖）
 */
export function calculateNodeReadyState(
  nodeId: string,
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): NodeExecutionState {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return 'idle';

  // 如果节点正在运行或已完成，保持状态
  if (node.state === 'running' || node.state === 'success' || node.state === 'error') {
    return node.state;
  }

  // 检查依赖
  const dependencies = getNodeDependencies(nodeId, nodes, edges);

  // 没有依赖的节点默认就绪
  if (dependencies.length === 0) {
    return 'ready';
  }

  // 检查所有依赖是否完成
  const allDependenciesReady = dependencies.every((dep) => dep.state === 'success');
  const anyDependencyFailed = dependencies.some((dep) => dep.state === 'error');

  if (anyDependencyFailed) {
    return 'warning'; // 有依赖失败
  }

  if (allDependenciesReady) {
    return 'ready';
  }

  return 'idle';
}

/**
 * 批量更新所有节点的就绪状态
 */
export function updateAllNodesReadyState(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): AgentCanvasNodeV2[] {
  return nodes.map((node) => {
    // 跳过正在运行或已完成的节点
    if (node.state === 'running' || node.state === 'success' || node.state === 'error') {
      return node;
    }

    const newState = calculateNodeReadyState(node.id, nodes, edges);
    if (newState !== node.state) {
      return { ...node, state: newState };
    }
    return node;
  });
}

// ==========================================
// 执行顺序
// ==========================================

/**
 * 获取可执行的节点（依赖已满足且未执行）
 */
export function getExecutableNodes(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): AgentCanvasNodeV2[] {
  return nodes.filter((node) => {
    // 只选择就绪状态的节点
    if (node.state !== 'ready' && node.state !== 'idle') return false;

    // 检查依赖是否都完成
    const { ready } = checkDependenciesReady(node.id, nodes, edges);
    return ready;
  });
}

/**
 * 获取执行顺序（拓扑排序）
 */
export function getExecutionOrder(
  nodes: AgentCanvasNodeV2[],
  edges: AgentCanvasEdgeV2[],
): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const order: string[] = [];

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
  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  }

  // BFS 遍历
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}
