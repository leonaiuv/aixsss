import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { CalendarDays, Play, Plus } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { isApiMode } from '@/lib/runtime/mode';

type EpisodePlanNodeData = {
  label?: string;
  targetEpisodeCount?: number;
};

function normalizeInt(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(24, Math.round(n)));
}

function createNodeId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function createEdgeId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `edge_${Date.now()}_${rand}`;
}

export type EpisodePlanFlowNode = Node<EpisodePlanNodeData, 'episode_plan'>;

export function EpisodePlanNode({ id, data }: NodeProps<EpisodePlanFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const aiProfileId = useConfigStore((s) => s.config?.aiProfileId ?? null);

  const episodes = useEpisodeStore((s) => s.episodes);
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes);
  const isRunning = useEpisodeStore((s) => s.isRunningWorkflow);
  const progress = useEpisodeStore((s) => s.lastJobProgress);
  const error = useEpisodeStore((s) => s.error);
  const planEpisodes = useEpisodeStore((s) => s.planEpisodes);

  const rf = useReactFlow();

  const initialCount = normalizeInt(data.targetEpisodeCount, 8);
  const [targetEpisodeCount, setTargetEpisodeCount] = useState(initialCount);

  useEffect(() => {
    setTargetEpisodeCount(initialCount);
  }, [initialCount]);

  // 同步 node.data（用于后续持久化）
  useEffect(() => {
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...(n.data as Record<string, unknown>),
                targetEpisodeCount,
              },
            }
          : n,
      ),
    );
  }, [id, targetEpisodeCount, rf]);

  useEffect(() => {
    if (!projectId) return;
    if (!isApiMode()) return;
    loadEpisodes(projectId);
  }, [projectId, loadEpisodes]);

  const canRun = Boolean(isApiMode() && projectId && aiProfileId);

  const run = async () => {
    if (!projectId || !aiProfileId) return;
    await planEpisodes({ projectId, aiProfileId, targetEpisodeCount });
  };

  const episodeStats = useMemo(() => {
    const coreReady = episodes.filter((e) => Boolean(e.coreExpression)).length;
    return { total: episodes.length, coreReady };
  }, [episodes]);

  const createEpisodeNodes = () => {
    if (!projectId) return;
    if (!isApiMode()) return;
    if (episodes.length === 0) return;

    const self = rf.getNode(id);
    const baseX = (self?.position?.x ?? 0) + 420;
    const baseY = self?.position?.y ?? 0;

    const existing = new Set(rf.getNodes().map((n) => n.id));

    const newNodes = episodes.map((ep, idx) => {
      const nodeId = createNodeId(`episode_${ep.order}`);
      return {
        id: nodeId,
        type: 'episode',
        position: { x: baseX, y: baseY + idx * 220 },
        data: { label: `第${ep.order}集`, episodeId: ep.id, episodeOrder: ep.order },
      };
    });

    const filteredNodes = newNodes.filter((n) => !existing.has(n.id));

    const newEdges = newNodes.map((n) => ({
      id: createEdgeId(),
      source: id,
      target: n.id,
    }));

    rf.setNodes((nds) => [...nds, ...filteredNodes]);
    rf.setEdges((eds) => [...eds, ...newEdges]);
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          {data.label ?? '剧集规划'}
        </span>
      }
      description="根据全局设定生成 N 集概要（可迭代）。"
      headerRight={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={createEpisodeNodes} disabled={!isApiMode() || episodes.length === 0}>
            <Plus className="mr-1 h-4 w-4" />
            生成集节点
          </Button>
          <Button size="sm" onClick={run} disabled={!canRun || isRunning}>
            <Play className="mr-1 h-4 w-4" />
            运行
          </Button>
        </div>
      }
    >
      {!isApiMode() ? (
        <div className="text-xs text-muted-foreground">该节点仅在 API 模式可用（需要后端 + Worker）。</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground">目标集数</div>
            <Input
              type="number"
              min={1}
              max={24}
              value={targetEpisodeCount}
              onChange={(e) => setTargetEpisodeCount(normalizeInt(e.target.value, 8))}
              className="h-8 w-20"
            />
            <Badge variant="secondary" className="text-[11px]">
              已有 {episodeStats.total} 集 · 核心表达 {episodeStats.coreReady}
            </Badge>
          </div>

          {isRunning ? (
            <div className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
              <div>执行中...</div>
              {progress?.message ? <div className="mt-1">{progress.message}</div> : null}
              {typeof progress?.pct === 'number' ? (
                <div className="mt-1">进度：{Math.round(progress.pct)}%</div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </NodeFrame>
  );
}
