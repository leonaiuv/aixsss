import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useProjectStore } from '@/stores/projectStore';
import { createDefaultAgentCanvasGraph, parseAgentCanvasGraph } from '@/lib/agent/graph';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { AgentCanvasGraphV1, AgentCanvasNodeType, ChatMessage, ProjectContextCache } from '@/types';
import { ProjectNode } from './nodes/ProjectNode';
import { WorldViewNode } from './nodes/WorldViewNode';
import { CharactersNode } from './nodes/CharactersNode';
import { EpisodePlanNode } from './nodes/EpisodePlanNode';
import { EpisodeNode } from './nodes/EpisodeNode';
import { EpisodeSceneListNode } from './nodes/EpisodeSceneListNode';
import { RefineAllScenesNode } from './nodes/RefineAllScenesNode';
import { ExportNode } from './nodes/ExportNode';
import { LlmNode } from './nodes/LlmNode';
import { AgentChatPanel, type AgentChatMode } from './AgentChatPanel';
import { useConfigStore } from '@/stores/configStore';
import { AIFactory } from '@/lib/ai/factory';
import { buildCanvasPatchWithAgent, type AgentCanvasPatch } from '@/lib/agent/builderAgent';
type DeleteNodeOp = Extract<AgentCanvasPatch['ops'][number], { op: 'delete_node' }>;

type CanvasNodeData = Record<string, unknown> & { label?: string };

const nodeTypes = {
  project: ProjectNode,
  world_view: WorldViewNode,
  characters: CharactersNode,
  episode_plan: EpisodePlanNode,
  episode: EpisodeNode,
  episode_scene_list: EpisodeSceneListNode,
  refine_all_scenes: RefineAllScenesNode,
  export: ExportNode,
  llm: LlmNode,
} as const;

const NODE_LIBRARY: Array<{ type: AgentCanvasNodeType; label: string; description: string }> = [
  { type: 'project', label: '全局设定', description: '标题/梗概/主角/画风' },
  { type: 'world_view', label: '世界观', description: '世界观要素' },
  { type: 'characters', label: '角色', description: '角色库' },
  { type: 'episode_plan', label: '剧集规划', description: '生成 N 集概要' },
  { type: 'episode', label: '单集创作', description: '核心表达' },
  { type: 'episode_scene_list', label: '分镜生成', description: '生成分镜列表' },
  { type: 'refine_all_scenes', label: '分镜细化（批量）', description: '细化全部分镜' },
  { type: 'llm', label: 'LLM 节点', description: '通用对话/润色/结构化' },
  { type: 'export', label: '导出', description: '生成 Markdown' },
];

function buildFlowNodes(raw: unknown): Node<CanvasNodeData>[] {
  const graph = parseAgentCanvasGraph(raw) ?? createDefaultAgentCanvasGraph();
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as CanvasNodeData,
  }));
}

function buildFlowEdges(raw: unknown): Edge[] {
  const graph = parseAgentCanvasGraph(raw) ?? createDefaultAgentCanvasGraph();
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: e.type,
    label: e.label,
  }));
}

function CanvasLayout() {
  const project = useProjectStore((s) => s.currentProject);
  const projectId = project?.id ?? null;
  const updateProject = useProjectStore((s) => s.updateProject);

  const config = useConfigStore((s) => s.config);
  const isConfigured = useConfigStore((s) => s.isConfigured);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // 首次进入 / 切换项目：从 Project.contextCache.agentCanvas 加载画布
  useEffect(() => {
    if (!projectId) return;
    if (activeProjectId === projectId) return;
    setActiveProjectId(projectId);

    const raw = project?.contextCache?.agentCanvas ?? null;
    const graph = parseAgentCanvasGraph(raw) ?? createDefaultAgentCanvasGraph();
    setNodes(buildFlowNodes(graph));
    setEdges(buildFlowEdges(graph));

    // 优先恢复 viewport，否则 fitView
    queueMicrotask(() => {
      try {
        const inst = flowRef.current;
        if (!inst) return;
        if (graph.viewport) {
          inst.setViewport(graph.viewport, { duration: 0 });
        } else {
          inst.fitView({ padding: 0.2, duration: 300 });
        }
      } catch {
        // ignore
      }
    });
  }, [projectId, activeProjectId, project?.contextCache?.agentCanvas, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  const onInit = useCallback((instance: ReactFlowInstance<Node<CanvasNodeData>, Edge>) => {
    flowRef.current = instance;
  }, []);

  const [chatMode, setChatMode] = useState<AgentChatMode>('build');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRunning, setChatRunning] = useState(false);
  const persistTimerRef = useRef<number | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);

  const allowedNodeTypes = useMemo(() => new Set(NODE_LIBRARY.map((n) => n.type)), []);

  const graphSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`nodes=${nodes.length}, edges=${edges.length}`);
    for (const n of nodes.slice(0, 40)) {
      const label = typeof n.data.label === 'string' ? n.data.label : '';
      lines.push(`- ${n.id} (${n.type}) ${label ? `: ${label}` : ''}`);
    }
    if (nodes.length > 40) lines.push(`... (${nodes.length - 40} more nodes)`);
    return lines.join('\n');
  }, [nodes, edges]);

  const getCanvasCenter = useCallback(() => {
    try {
      const inst = flowRef.current;
      if (!inst) return { x: 100, y: 100 };
      const viewport = inst.getViewport();
      return { x: -viewport.x / viewport.zoom + 200, y: -viewport.y / viewport.zoom + 120 };
    } catch {
      return { x: 100, y: 100 };
    }
  }, []);

  const applyPatch = useCallback(
    (patch: AgentCanvasPatch) => {
      const deletedNodes = new Set(
        patch.ops.filter((op): op is DeleteNodeOp => op.op === 'delete_node').map((op) => op.id),
      );

      const createNodeId = (type: AgentCanvasNodeType) => {
        const rand = Math.random().toString(36).slice(2, 8);
        return `${type}_${Date.now()}_${rand}`;
      };

      const createEdgeId = () => {
        const rand = Math.random().toString(36).slice(2, 8);
        return `edge_${Date.now()}_${rand}`;
      };

      setNodes((prev) => {
        let next = [...prev];
        for (const op of patch.ops) {
          if (op.op === 'add_node') {
            const nodeId = op.node.id ?? createNodeId(op.node.type);
            if (next.some((n) => n.id === nodeId)) continue;
            const position = op.node.position ?? getCanvasCenter();
            const libLabel = NODE_LIBRARY.find((n) => n.type === op.node.type)?.label ?? op.node.type;
            const nodeData = { label: libLabel, ...(op.node.data ?? {}) };
            next.push({ id: nodeId, type: op.node.type, position, data: nodeData });
          } else if (op.op === 'update_node') {
            next = next.map((n) => (n.id === op.id ? { ...n, data: { ...n.data, ...op.data } } : n));
          } else if (op.op === 'delete_node') {
            next = next.filter((n) => n.id !== op.id);
          }
        }
        return next;
      });

      setEdges((prev) => {
        let next = prev.filter((e) => !deletedNodes.has(e.source) && !deletedNodes.has(e.target));
        for (const op of patch.ops) {
          if (op.op === 'connect') {
            const edgeId = op.edge.id ?? createEdgeId();
            if (next.some((e) => e.id === edgeId)) continue;
            next = [
              ...next,
              {
                id: edgeId,
                source: op.edge.source,
                target: op.edge.target,
                sourceHandle: op.edge.sourceHandle,
                targetHandle: op.edge.targetHandle,
              },
            ];
          } else if (op.op === 'delete_edge') {
            next = next.filter((e) => e.id !== op.id);
          } else if (op.op === 'delete_node') {
            next = next.filter((e) => e.source !== op.id && e.target !== op.id);
          }
        }
        return next;
      });
    },
    [setNodes, setEdges, getCanvasCenter],
  );

  const addNode = useCallback(
    (type: AgentCanvasNodeType) => {
      const rand = Math.random().toString(36).slice(2, 8);
      const nodeId = `${type}_${Date.now()}_${rand}`;
      const center = getCanvasCenter();

      setNodes((nds) => [
        ...nds,
        {
          id: nodeId,
          type,
          position: center,
          data: { label: NODE_LIBRARY.find((n) => n.type === type)?.label ?? type },
        },
      ]);
    },
    [setNodes, getCanvasCenter],
  );

  // 画布持久化：写入 Project.contextCache.agentCanvas（debounce，避免拖拽导致频繁写入）
  useEffect(() => {
    if (!projectId) return;
    if (!activeProjectId || activeProjectId !== projectId) return;

    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      const viewport = (() => {
        try {
          return flowRef.current?.getViewport() ?? null;
        } catch {
          return null;
        }
      })();

      const graph: AgentCanvasGraphV1 = {
        version: 1,
        nodes: nodes.map((n) => ({
          id: n.id,
          type:
            typeof n.type === 'string' && allowedNodeTypes.has(n.type as AgentCanvasNodeType)
              ? (n.type as AgentCanvasNodeType)
              : 'llm',
          position: n.position,
          data: (n.data ?? {}) as Record<string, unknown>,
          width: typeof n.width === 'number' ? n.width : undefined,
          height: typeof n.height === 'number' ? n.height : undefined,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          type: typeof e.type === 'string' ? e.type : undefined,
          label: typeof e.label === 'string' ? e.label : undefined,
        })),
        ...(viewport ? { viewport } : {}),
      };

      const latestProject = useProjectStore.getState().currentProject;
      const baseCache: ProjectContextCache = latestProject?.contextCache ?? {};

      updateProject(projectId, {
        contextCache: {
          ...baseCache,
          agentCanvas: graph,
        },
      });
    }, 600);

    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [projectId, activeProjectId, nodes, edges, updateProject, allowedNodeTypes, viewportRevision]);

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
            nodeLibrary: NODE_LIBRARY,
          });
          setChatMessages((prev) => [...prev, { role: 'assistant', content: res.assistantMessage }]);
          if (res.patch) applyPatch(res.patch);
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
    [
      applyPatch,
      chatMessages,
      chatMode,
      config,
      graphSummary,
      isConfigured,
    ],
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: Chat */}
      <aside className="w-[360px] shrink-0 border-r bg-background">
        <AgentChatPanel
          mode={chatMode}
          onModeChange={setChatMode}
          messages={chatMessages}
          isRunning={chatRunning}
          onSend={onSend}
        />
      </aside>

      {/* Right: Canvas */}
      <section className="relative flex-1">
        <div className="absolute right-3 top-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <Plus className="mr-1 h-4 w-4" />
                添加节点
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {NODE_LIBRARY.map((item) => (
                <DropdownMenuItem key={item.type} onClick={() => addNode(item.type)}>
                  <div className="flex flex-col">
                    <div className="text-sm">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={onInit}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onMoveEnd={() => setViewportRevision((v) => v + 1)}
          fitView
        >
          <Background gap={16} size={1} />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </section>
    </div>
  );
}

export function AgentCanvasEditor() {
  // ReactFlow 内部 hook 需要 Provider
  return (
    <ReactFlowProvider>
      <CanvasLayout />
    </ReactFlowProvider>
  );
}
