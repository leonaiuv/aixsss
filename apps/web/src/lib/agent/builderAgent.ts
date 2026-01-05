import { z } from 'zod';
import { AIFactory } from '@/lib/ai/factory';
import type { AgentCanvasNodeType, ChatMessage, UserConfig } from '@/types';

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

const PositionSchema = z.object({ x: z.number(), y: z.number() });

const AddNodeOpSchema = z.object({
  op: z.literal('add_node'),
  node: z.object({
    id: z.string().min(1).optional(),
    type: AgentCanvasNodeTypeSchema,
    position: PositionSchema.optional(),
    data: z.record(z.unknown()).optional(),
  }),
});

const UpdateNodeOpSchema = z.object({
  op: z.literal('update_node'),
  id: z.string().min(1),
  data: z.record(z.unknown()),
});

const DeleteNodeOpSchema = z.object({
  op: z.literal('delete_node'),
  id: z.string().min(1),
});

const ConnectOpSchema = z.object({
  op: z.literal('connect'),
  edge: z.object({
    id: z.string().min(1).optional(),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().min(1).optional(),
    targetHandle: z.string().min(1).optional(),
  }),
});

const DeleteEdgeOpSchema = z.object({
  op: z.literal('delete_edge'),
  id: z.string().min(1),
});

export const AgentCanvasPatchSchema = z.object({
  ops: z.array(
    z.discriminatedUnion('op', [
      AddNodeOpSchema,
      UpdateNodeOpSchema,
      DeleteNodeOpSchema,
      ConnectOpSchema,
      DeleteEdgeOpSchema,
    ]),
  ),
});

export type AgentCanvasPatch = z.infer<typeof AgentCanvasPatchSchema>;

const BuilderResponseSchema = z.object({
  assistantMessage: z.string().min(1),
  patch: AgentCanvasPatchSchema.optional(),
});

export type BuilderResponse = z.infer<typeof BuilderResponseSchema>;

function extractJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();

  // 1) ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // ignore
    }
  }

  // 2) first {...} block (best-effort)
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }

  return null;
}

function buildSystemPrompt(params: {
  nodeLibrary: Array<{ type: AgentCanvasNodeType; label: string; description: string }>;
}) {
  const lines = params.nodeLibrary
    .map((n) => `- ${n.type}: ${n.label}（${n.description}）`)
    .join('\n');

  return [
    '你是“画布工作流构建 Agent”。你的任务：把用户的自然语言需求，转换成对画布的结构化修改。',
    '',
    '可用节点类型：',
    lines,
    '',
    '你必须只输出 JSON（不要额外解释、不要 Markdown），格式如下：',
    '{',
    '  "assistantMessage": "给用户看的简短说明",',
    '  "patch": {',
    '    "ops": [',
    '      { "op": "add_node", "node": { "type": "project", "data": { "label": "全局设定" } } },',
    '      { "op": "connect", "edge": { "source": "nodeA", "target": "nodeB" } }',
    '    ]',
    '  }',
    '}',
    '',
    '规则：',
    '- 只能使用上述 op：add_node / update_node / delete_node / connect / delete_edge',
    '- add_node.id/position 可省略；data 是一个 JSON 对象',
    '- connect 需要使用现有 node id；edge.id 可省略',
    '- assistantMessage 简短清晰（中文），不要超过 4 行',
  ].join('\n');
}

export async function buildCanvasPatchWithAgent(input: {
  config: UserConfig;
  userMessage: string;
  graphSummary: string;
  nodeLibrary: Array<{ type: AgentCanvasNodeType; label: string; description: string }>;
}): Promise<BuilderResponse> {
  const client = AIFactory.createClient(input.config);

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ nodeLibrary: input.nodeLibrary }) },
    {
      role: 'user',
      content: ['当前画布摘要：', input.graphSummary, '', '用户需求：', input.userMessage].join(
        '\n',
      ),
    },
  ];

  const resp = await client.chat(messages);
  const raw = extractJsonFromText(resp.content);
  const parsed = BuilderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      assistantMessage:
        '我没能稳定解析出建图指令（已按普通回答返回）。你可以再试一次，或用右上角“添加节点”。',
      patch: undefined,
    };
  }
  return parsed.data;
}
