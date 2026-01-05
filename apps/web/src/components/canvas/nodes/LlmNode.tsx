import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { Bot, Play } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConfigStore } from '@/stores/configStore';
import { AIFactory } from '@/lib/ai/factory';
import type { ChatMessage } from '@/types';

type LlmNodeData = {
  label?: string;
  system?: string;
  prompt?: string;
  output?: string;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export type LlmFlowNode = Node<LlmNodeData, 'llm'>;

export function LlmNode({ id, data }: NodeProps<LlmFlowNode>) {
  const rf = useReactFlow();
  const config = useConfigStore((s) => s.config);
  const isConfigured = useConfigStore((s) => s.isConfigured);

  const [system, setSystem] = useState(safeString(data.system));
  const [prompt, setPrompt] = useState(safeString(data.prompt));
  const [output, setOutput] = useState(safeString(data.output));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSystem(safeString(data.system)), [data.system]);
  useEffect(() => setPrompt(safeString(data.prompt)), [data.prompt]);
  useEffect(() => setOutput(safeString(data.output)), [data.output]);

  const canRun = useMemo(
    () => Boolean(isConfigured && config && prompt.trim()),
    [isConfigured, config, prompt],
  );

  const syncData = (patch: Partial<LlmNodeData>) => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...(n.data as Record<string, unknown>), ...patch } } : n,
      ),
    );
  };

  const run = async () => {
    if (!config) return;
    if (!prompt.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const client = AIFactory.createClient(config);
      const messages: ChatMessage[] = [];
      if (system.trim()) messages.push({ role: 'system', content: system.trim() });
      messages.push({ role: 'user', content: prompt.trim() });
      const resp = await client.chat(messages);
      setOutput(resp.content);
      syncData({ output: resp.content });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          {data.label ?? 'LLM 节点'}
        </span>
      }
      description="通用 Agent/LLM 调用节点（适合做补完、润色、结构化输出）。"
      headerRight={
        <Button size="sm" onClick={run} disabled={!canRun || running}>
          <Play className="mr-1 h-4 w-4" />
          {running ? '运行中' : '运行'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">System（可选）</div>
          <Textarea
            value={system}
            onChange={(e) => {
              setSystem(e.target.value);
              syncData({ system: e.target.value });
            }}
            placeholder="你是一个编剧/分镜导演..."
            className="min-h-[70px] resize-none text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Prompt</div>
          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              syncData({ prompt: e.target.value });
            }}
            placeholder="输入你想让 AI 做的事..."
            className="min-h-[90px] resize-none"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Output</div>
          <ScrollArea className="h-[170px] rounded-md border bg-background/60">
            <pre className="p-2 text-[11px] leading-snug">
              {output || '（运行后输出显示在这里）'}
            </pre>
          </ScrollArea>
        </div>
      </div>
    </NodeFrame>
  );
}
