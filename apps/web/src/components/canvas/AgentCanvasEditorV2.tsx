/**
 * AgentCanvas 画布编辑器 V2
 * 全面重构版本，支持新节点体系、撤销/重做、弹窗编辑等功能
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type ReactFlowInstance,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore, selectCanUndo, selectCanRedo } from '@/stores/canvasStore';
import { useConfigStore } from '@/stores/configStore';
import type {
  AgentCanvasNodeV2,
  AgentCanvasEdgeV2,
  AgentCanvasGraphV2,
  AgentCanvasNodeTypeV2,
} from '@/types/canvas';
import type { ProjectContextCache } from '@/types';
import { NODE_LIBRARY_V2 } from '@/types/canvas';

// 组件导入
import { CanvasToolbar } from './CanvasToolbar';
import { NodePalette } from './NodePalette';
import { NodeEditDialog } from './NodeEditDialog';
import { AgentChatPanel, type AgentChatMode } from './AgentChatPanel';
import {
  ProjectSettingsNodeV2,
  WorldViewNodeV2,
  CharactersNodeV2,
  NarrativeCausalChainNodeV2,
  EpisodePlanNodeV2,
  EpisodeNodeV2,
  CoreExpressionNodeV2,
  SceneListNodeV2,
  SceneAnchorNodeV2,
  ActionPlanNodeV2,
  KeyframeGroupsNodeV2,
  BatchRefineNodeV2,
  DialogueNodeV2,
  ExportNodeV2,
  LlmNodeV2,
  ConditionNodeV2,
  GroupNodeV2,
} from './nodes/BaseNode';

import { AIFactory } from '@/lib/ai/factory';
import { buildCanvasPatchWithAgent, type AgentCanvasPatch } from '@/lib/agent/builderAgent';
import type { ChatMessage } from '@/types';
import { useState } from 'react';

// ==========================================
// 节点类型映射
// ==========================================

const nodeTypes = {
  project_settings: ProjectSettingsNodeV2,
  world_view: WorldViewNodeV2,
  characters: CharactersNodeV2,
  narrative_causal_chain: NarrativeCausalChainNodeV2,
  episode_plan: EpisodePlanNodeV2,
  episode: EpisodeNodeV2,
  core_expression: CoreExpressionNodeV2,
  scene_list: SceneListNodeV2,
  scene_anchor: SceneAnchorNodeV2,
  action_plan: ActionPlanNodeV2,
  keyframe_groups: KeyframeGroupsNodeV2,
  batch_refine: BatchRefineNodeV2,
  dialogue: DialogueNodeV2,
  export: ExportNodeV2,
  llm: LlmNodeV2,
  condition: ConditionNodeV2,
  group: GroupNodeV2,
} as const;

// ==========================================
// 辅助函数
// ==========================================

/** 将 Store 节点转换为 ReactFlow 节点 */
function toFlowNodes(nodes: AgentCanvasNodeV2[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    selected: false,
  }));
}

/** 将 Store 边转换为 ReactFlow 边 */
function toFlowEdges(edges: AgentCanvasEdgeV2[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: e.type,
    label: e.label,
    animated: e.animated,
  }));
}

// ==========================================
// CanvasContent 组件
// ==========================================

function CanvasContent() {
  const _reactFlowInstance = useReactFlow();

  // Project Store
  const project = useProjectStore((s) => s.currentProject);
  const projectId = project?.id ?? null;
  const updateProject = useProjectStore((s) => s.updateProject);

  // Config Store
  const config = useConfigStore((s) => s.config);
  const isConfigured = useConfigStore((s) => s.isConfigured);

  // Canvas Store
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.viewport);
  const isInitialized = useCanvasStore((s) => s.isInitialized);
  const isDirty = useCanvasStore((s) => s.isDirty);
  const initialize = useCanvasStore((s) => s.initialize);
  const _setNodes = useCanvasStore((s) => s.setNodes);
  const _setEdges = useCanvasStore((s) => s.setEdges);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const markClean = useCanvasStore((s) => s.markClean);
  const toGraph = useCanvasStore((s) => s.toGraph);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore(selectCanUndo);
  const canRedo = useCanvasStore(selectCanRedo);

  // ReactFlow 本地状态
  const [nodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  // 聊天状态
  const [chatMode, setChatMode] = useState<AgentChatMode>('build');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRunning, setChatRunning] = useState(false);

  // 持久化定时器
  const persistTimerRef = useRef<number | null>(null);

  // 初始化：从 Project 加载画布数据
  useEffect(() => {
    if (!projectId) return;

    const raw = project?.contextCache?.agentCanvas;
    let graph: AgentCanvasGraphV2 | null = null;

    // 尝试解析 V2 格式
    if (
      raw &&
      typeof raw === 'object' &&
      'version' in raw &&
      (raw as { version: unknown }).version === 2
    ) {
      graph = raw as unknown as AgentCanvasGraphV2;
    }

    initialize(projectId, graph);
  }, [projectId, project?.contextCache?.agentCanvas, initialize]);

  // 同步 Store 到 ReactFlow
  useEffect(() => {
    if (!isInitialized) return;
    setFlowNodes(toFlowNodes(storeNodes));
    setFlowEdges(toFlowEdges(storeEdges));
  }, [isInitialized, storeNodes, storeEdges, setFlowNodes, setFlowEdges]);

  // 恢复视口
  useEffect(() => {
    if (!isInitialized || !flowRef.current) return;

    if (viewport.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1) {
      flowRef.current.setViewport(viewport, { duration: 0 });
    } else {
      flowRef.current.fitView({ padding: 0.2, duration: 300 });
    }
  }, [isInitialized, viewport]);

  // 持久化到 Project（防抖）
  useEffect(() => {
    if (!projectId || !isInitialized || !isDirty) return;

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      const graph = toGraph();
      const currentViewport = flowRef.current?.getViewport();
      if (currentViewport) {
        graph.viewport = currentViewport;
      }

      const latestProject = useProjectStore.getState().currentProject;
      const baseCache: ProjectContextCache = (latestProject?.contextCache ??
        {}) as ProjectContextCache;

      updateProject(projectId, {
        contextCache: {
          ...baseCache,
          agentCanvas: graph as unknown as import('@/types').AgentCanvasGraphV1,
        },
      });

      markClean();
    }, 600);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [projectId, isInitialized, isDirty, toGraph, updateProject, markClean]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Z: 撤销
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
      // Cmd/Ctrl + Shift + Z: 重做
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      }
      // Delete/Backspace: 删除选中
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 只在没有聚焦输入框时触发
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        useCanvasStore.getState().deleteSelectedNodes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // ReactFlow 初始化
  const onInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    flowRef.current = instance;
  }, []);

  // 处理节点变更
  const handleNodesChange: OnNodesChange<Node> = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChange(changes);

      // 同步位置变更到 Store
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNode(change.id, { position: change.position });
        }
        if (change.type === 'select') {
          if (change.selected) {
            selectNode(change.id, false);
          } else {
            clearSelection();
          }
        }
        if (change.type === 'remove') {
          deleteNode(change.id);
        }
      }
    },
    [onNodesChange, updateNode, selectNode, clearSelection, deleteNode],
  );

  // 处理边变更
  const handleEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);

      for (const change of changes) {
        if (change.type === 'remove') {
          deleteEdge(change.id);
        }
      }
    },
    [onEdgesChange, deleteEdge],
  );

  // 处理连接
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      pushHistory('添加连接');
      addEdge({
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      });
    },
    [addEdge, pushHistory],
  );

  // 处理拖放
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as AgentCanvasNodeTypeV2;
      if (!type || !flowRef.current) return;

      const position = flowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type, position);
    },
    [addNode],
  );

  // 视口变更
  const onMoveEnd = useCallback(() => {
    if (!flowRef.current) return;
    const vp = flowRef.current.getViewport();
    setViewport(vp);
  }, [setViewport]);

  // 画布摘要（用于 AI 构建）
  const graphSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`nodes=${storeNodes.length}, edges=${storeEdges.length}`);
    for (const n of storeNodes.slice(0, 40)) {
      const label = typeof n.data.label === 'string' ? n.data.label : '';
      lines.push(`- ${n.id} (${n.type}) ${label ? `: ${label}` : ''}`);
    }
    if (storeNodes.length > 40) lines.push(`... (${storeNodes.length - 40} more nodes)`);
    return lines.join('\n');
  }, [storeNodes, storeEdges]);

  // 应用 AI 补丁
  const applyPatch = useCallback(
    (patch: AgentCanvasPatch) => {
      pushHistory('AI 构建');

      for (const op of patch.ops) {
        if (op.op === 'add_node') {
          const pos = op.node.position ?? { x: 100, y: 100 };
          addNode(op.node.type as AgentCanvasNodeTypeV2, pos);
        } else if (op.op === 'update_node') {
          const storeState = useCanvasStore.getState();
          const existingNode = storeState.nodes.find((n) => n.id === op.id);
          if (existingNode) {
            updateNode(op.id, { data: { ...existingNode.data, ...op.data } });
          }
        } else if (op.op === 'delete_node') {
          deleteNode(op.id);
        } else if (op.op === 'connect') {
          addEdge({
            source: op.edge.source,
            target: op.edge.target,
            sourceHandle: op.edge.sourceHandle,
            targetHandle: op.edge.targetHandle,
          });
        } else if (op.op === 'delete_edge') {
          deleteEdge(op.id);
        }
      }
    },
    [pushHistory, addNode, updateNode, deleteNode, addEdge, deleteEdge],
  );

  // 聊天发送
  const onSend = useCallback(
    async (text: string) => {
      setChatMessages((prev) => [...prev, { role: 'user', content: text }]);

      if (!isConfigured || !config) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '当前未配置可用的 AI 档案，请先在左侧栏「AI 设置」里完成配置。',
          },
        ]);
        return;
      }

      setChatRunning(true);
      try {
        if (chatMode === 'chat') {
          const client = AIFactory.createClient(config);
          const history = chatMessages
            .slice(-16)
            .filter((m) => m.role === 'user' || m.role === 'assistant');
          const resp = await client.chat([
            ...history,
            { role: 'user', content: text },
          ] as ChatMessage[]);
          setChatMessages((prev) => [...prev, { role: 'assistant', content: resp.content }]);
        } else {
          const res = await buildCanvasPatchWithAgent({
            config,
            userMessage: text,
            graphSummary,
            nodeLibrary: NODE_LIBRARY_V2.map((item) => ({
              type: item.type as string,
              label: item.label,
              description: item.description,
            })) as Array<{
              type: import('@/types').AgentCanvasNodeType;
              label: string;
              description: string;
            }>,
          });
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: res.assistantMessage },
          ]);
          if (res.patch) {
            applyPatch(res.patch);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `发生错误：${message}` },
        ]);
      } finally {
        setChatRunning(false);
      }
    },
    [applyPatch, chatMode, chatMessages, config, graphSummary, isConfigured],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-3 py-2">
        <CanvasToolbar />
      </div>

      {/* 主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧面板 */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r bg-background">
          {/* 节点库 */}
          <div className="h-[45%] border-b">
            <NodePalette />
          </div>
          {/* 聊天面板 */}
          <div className="flex-1 min-h-0">
            <AgentChatPanel
              mode={chatMode}
              onModeChange={setChatMode}
              messages={chatMessages}
              isRunning={chatRunning}
              onSend={onSend}
            />
          </div>
        </aside>

        {/* 画布 */}
        <section className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={onInit}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveEnd={onMoveEnd}
            nodeTypes={nodeTypes as unknown as NodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
            }}
            connectionLineType={ConnectionLineType.SmoothStep}
            snapToGrid
            snapGrid={[16, 16]}
          >
            <Background gap={16} size={1} />
            <MiniMap pannable zoomable className="!bottom-4 !right-4" nodeStrokeWidth={3} />
            <Controls className="!bottom-4 !left-4" />
          </ReactFlow>
        </section>
      </div>

      {/* 节点编辑弹窗 */}
      <NodeEditDialog />
    </div>
  );
}

// ==========================================
// AgentCanvasEditor 组件
// ==========================================

export function AgentCanvasEditor() {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
}
