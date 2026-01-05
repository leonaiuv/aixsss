import { z } from 'zod';
import type { AgentCanvasGraphV1, AgentCanvasNodeType } from '@/types';

const AgentCanvasNodeTypeSchema = z.enum([
  'project',
  'world_view',
  'characters',
  'episode_plan',
  'episode',
  'episode_scene_list',
  'refine_all_scenes',
  'export',
  'llm',
]);

const AgentCanvasViewportV1Schema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

const AgentCanvasNodeV1Schema = z.object({
  id: z.string().min(1),
  type: AgentCanvasNodeTypeSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
  width: z.number().optional(),
  height: z.number().optional(),
});

const AgentCanvasEdgeV1Schema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().min(1).optional(),
  targetHandle: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

const AgentCanvasGraphV1Schema = z.object({
  version: z.literal(1),
  nodes: z.array(AgentCanvasNodeV1Schema),
  edges: z.array(AgentCanvasEdgeV1Schema),
  viewport: AgentCanvasViewportV1Schema.optional(),
});

function createNodeId(type: AgentCanvasNodeType) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${type}_${Date.now()}_${rand}`;
}

function createEdgeId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `edge_${Date.now()}_${rand}`;
}

export function parseAgentCanvasGraph(raw: unknown): AgentCanvasGraphV1 | null {
  const parsed = AgentCanvasGraphV1Schema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

export function createDefaultAgentCanvasGraph(): AgentCanvasGraphV1 {
  const nodes: AgentCanvasGraphV1['nodes'] = [
    {
      id: createNodeId('project'),
      type: 'project',
      position: { x: 0, y: 0 },
      data: { label: '全局设定' },
    },
    {
      id: createNodeId('world_view'),
      type: 'world_view',
      position: { x: 0, y: 240 },
      data: { label: '世界观' },
    },
    {
      id: createNodeId('characters'),
      type: 'characters',
      position: { x: 0, y: 480 },
      data: { label: '角色' },
    },
    {
      id: createNodeId('episode_plan'),
      type: 'episode_plan',
      position: { x: 420, y: 0 },
      data: { label: '剧集规划', targetEpisodeCount: 8 },
    },
    {
      id: createNodeId('episode'),
      type: 'episode',
      position: { x: 840, y: 0 },
      data: { label: '单集创作', episodeOrder: 1 },
    },
    {
      id: createNodeId('episode_scene_list'),
      type: 'episode_scene_list',
      position: { x: 1260, y: 0 },
      data: { label: '分镜生成', sceneCountHint: 10 },
    },
    {
      id: createNodeId('refine_all_scenes'),
      type: 'refine_all_scenes',
      position: { x: 1680, y: 0 },
      data: { label: '分镜细化（批量）' },
    },
    {
      id: createNodeId('export'),
      type: 'export',
      position: { x: 2100, y: 0 },
      data: { label: '导出' },
    },
  ];

  const [project, worldView, characters, plan, episode, sceneList, refine, exportNode] = nodes;

  const edges: AgentCanvasGraphV1['edges'] = [
    { id: createEdgeId(), source: project.id, target: plan.id },
    { id: createEdgeId(), source: worldView.id, target: plan.id },
    { id: createEdgeId(), source: characters.id, target: plan.id },
    { id: createEdgeId(), source: plan.id, target: episode.id },
    { id: createEdgeId(), source: episode.id, target: sceneList.id },
    { id: createEdgeId(), source: sceneList.id, target: refine.id },
    { id: createEdgeId(), source: refine.id, target: exportNode.id },
  ];

  return {
    version: 1,
    nodes,
    edges,
    viewport: { x: -40, y: -40, zoom: 0.8 },
  };
}

