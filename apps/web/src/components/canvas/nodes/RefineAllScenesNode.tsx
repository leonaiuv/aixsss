import { useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Sparkles, StopCircle } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import { apiWorkflowRefineAllScenes } from '@/lib/api/workflow';
import { isApiMode } from '@/lib/runtime/mode';

type RefineAllScenesNodeData = {
  label?: string;
};

type NormalizedJobProgress = { pct: number | null; message: string | null };

function normalizeJobProgress(progress: unknown): NormalizedJobProgress {
  const p = progress as { pct?: unknown; message?: unknown } | null;
  const pct = typeof p?.pct === 'number' ? p.pct : null;
  const message = typeof p?.message === 'string' ? p.message : null;
  return { pct, message };
}

export type RefineAllScenesFlowNode = Node<RefineAllScenesNodeData, 'refine_all_scenes'>;

export function RefineAllScenesNode({ data }: NodeProps<RefineAllScenesFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const aiProfileId = useConfigStore((s) => s.config?.aiProfileId ?? null);

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<NormalizedJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = Boolean(isApiMode() && projectId && aiProfileId);

  const run = async () => {
    if (!projectId || !aiProfileId) return;
    setIsRunning(true);
    setError(null);
    setProgress({ pct: 0, message: '准备批量细化...' });
    try {
      const job = await apiWorkflowRefineAllScenes({ projectId, aiProfileId });
      await apiWaitForAIJob(job.id, {
        onProgress: (p) => setProgress(normalizeJobProgress(p)),
        timeoutMs: 30 * 60_000,
      });
      setProgress({ pct: 100, message: '完成' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {data.label ?? '分镜细化（批量）'}
        </span>
      }
      description="对项目内所有分镜执行细化工作流（可重试、可审计）。"
      headerRight={
        <Button size="sm" onClick={run} disabled={!canRun || isRunning}>
          {isRunning ? (
            <StopCircle className="mr-1 h-4 w-4" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {isRunning ? '进行中' : '运行'}
        </Button>
      }
    >
      {!isApiMode() ? (
        <div className="text-xs text-muted-foreground">
          该节点仅在 API 模式可用（需要后端 + Worker）。
        </div>
      ) : (
        <div className="space-y-2 text-xs text-muted-foreground">
          {progress ? (
            <div className="rounded-md border bg-background/60 p-2">
              <div>{progress.message ?? '执行中...'}</div>
              {typeof progress.pct === 'number' ? (
                <div className="mt-1">进度：{Math.round(progress.pct)}%</div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border bg-background/60 p-2">尚未运行。</div>
          )}
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </NodeFrame>
  );
}
