import { useEffect, useMemo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { Film, Play } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { isApiMode } from '@/lib/runtime/mode';

type EpisodeNodeData = {
  label?: string;
  episodeId?: string;
  episodeOrder?: number;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? '');
  }
}

export type EpisodeFlowNode = Node<EpisodeNodeData, 'episode'>;

export function EpisodeNode({ id, data }: NodeProps<EpisodeFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const aiProfileId = useConfigStore((s) => s.config?.aiProfileId ?? null);

  const episodes = useEpisodeStore((s) => s.episodes);
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes);
  const isRunning = useEpisodeStore((s) => s.isRunningWorkflow);
  const progress = useEpisodeStore((s) => s.lastJobProgress);
  const error = useEpisodeStore((s) => s.error);
  const generateCoreExpression = useEpisodeStore((s) => s.generateCoreExpression);

  const rf = useReactFlow();

  useEffect(() => {
    if (!projectId) return;
    if (!isApiMode()) return;
    loadEpisodes(projectId);
  }, [projectId, loadEpisodes]);

  const selectedEpisode = useMemo(() => {
    const byId = typeof data.episodeId === 'string' ? episodes.find((e) => e.id === data.episodeId) : null;
    if (byId) return byId;
    const byOrder =
      typeof data.episodeOrder === 'number' ? episodes.find((e) => e.order === data.episodeOrder) : null;
    return byOrder ?? episodes[0] ?? null;
  }, [episodes, data.episodeId, data.episodeOrder]);

  const selectedEpisodeId = selectedEpisode?.id;
  const selectedEpisodeOrder = selectedEpisode?.order;

  useEffect(() => {
    if (!selectedEpisodeId || typeof selectedEpisodeOrder !== 'number') return;
    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...(n.data as Record<string, unknown>),
                episodeId: selectedEpisodeId,
                episodeOrder: selectedEpisodeOrder,
              },
            }
          : n,
      ),
    );
  }, [id, rf, selectedEpisodeId, selectedEpisodeOrder]);

  const canRun = Boolean(isApiMode() && projectId && aiProfileId && selectedEpisode?.id);

  const run = async () => {
    if (!projectId || !aiProfileId || !selectedEpisode?.id) return;
    await generateCoreExpression({ projectId, episodeId: selectedEpisode.id, aiProfileId });
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          {data.label ?? '单集创作'}
        </span>
      }
      description="选择一个 Episode，生成核心表达（后续分镜生成会基于它）。"
      headerRight={
        <Button size="sm" onClick={run} disabled={!canRun || isRunning}>
          <Play className="mr-1 h-4 w-4" />
          核心表达
        </Button>
      }
    >
      {!isApiMode() ? (
        <div className="text-xs text-muted-foreground">该节点仅在 API 模式可用（需要后端 + Worker）。</div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">选择集数</div>
            <Select
              value={selectedEpisode?.id ?? ''}
              onValueChange={(nextId) => {
                const ep = episodes.find((e) => e.id === nextId);
                if (!ep) return;
                rf.setNodes((nds) =>
                  nds.map((n) =>
                    n.id === id
                      ? { ...n, data: { ...(n.data as Record<string, unknown>), episodeId: ep.id, episodeOrder: ep.order } }
                      : n,
                  ),
                );
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="选择 Episode" />
              </SelectTrigger>
              <SelectContent>
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    第{ep.order}集 {ep.title ? `· ${ep.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEpisode ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[11px]">
                summary {selectedEpisode.summary?.trim() ? '✓' : '—'}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                coreExpression {selectedEpisode.coreExpression ? '✓' : '—'}
              </Badge>
            </div>
          ) : null}

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

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">核心表达（预览）</div>
            <ScrollArea className="h-[170px] rounded-md border bg-background/60">
              <pre className="p-2 text-[11px] leading-snug">
                {selectedEpisode?.coreExpression ? safeJson(selectedEpisode.coreExpression) : '（尚未生成）'}
              </pre>
            </ScrollArea>
          </div>
        </div>
      )}
    </NodeFrame>
  );
}
