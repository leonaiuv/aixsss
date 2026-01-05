import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { LayoutGrid, Play } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useEpisodeScenesStore } from '@/stores/episodeScenesStore';
import { isApiMode } from '@/lib/runtime/mode';

type EpisodeSceneListNodeData = {
  label?: string;
  episodeId?: string;
  episodeOrder?: number;
  sceneCountHint?: number;
};

function normalizeInt(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(6, Math.min(24, Math.round(n)));
}

export type EpisodeSceneListFlowNode = Node<EpisodeSceneListNodeData, 'episode_scene_list'>;

export function EpisodeSceneListNode({ id, data }: NodeProps<EpisodeSceneListFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const aiProfileId = useConfigStore((s) => s.config?.aiProfileId ?? null);

  const episodes = useEpisodeStore((s) => s.episodes);
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes);
  const isRunning = useEpisodeStore((s) => s.isRunningWorkflow);
  const progress = useEpisodeStore((s) => s.lastJobProgress);
  const error = useEpisodeStore((s) => s.error);
  const generateSceneList = useEpisodeStore((s) => s.generateSceneList);

  const epScenes = useEpisodeScenesStore((s) => s.scenes);
  const epScenesLoading = useEpisodeScenesStore((s) => s.isLoading);
  const loadEpisodeScenes = useEpisodeScenesStore((s) => s.loadScenes);

  const rf = useReactFlow();

  const selectedEpisode = useMemo(() => {
    const byId =
      typeof data.episodeId === 'string' ? episodes.find((e) => e.id === data.episodeId) : null;
    if (byId) return byId;
    const byOrder =
      typeof data.episodeOrder === 'number'
        ? episodes.find((e) => e.order === data.episodeOrder)
        : null;
    return byOrder ?? episodes[0] ?? null;
  }, [episodes, data.episodeId, data.episodeOrder]);

  const selectedEpisodeId = selectedEpisode?.id;
  const selectedEpisodeOrder = selectedEpisode?.order;

  const initialCount = normalizeInt(data.sceneCountHint, 10);
  const [sceneCountHint, setSceneCountHint] = useState(initialCount);

  useEffect(() => setSceneCountHint(initialCount), [initialCount]);

  useEffect(() => {
    if (!projectId) return;
    if (!isApiMode()) return;
    loadEpisodes(projectId);
  }, [projectId, loadEpisodes]);

  useEffect(() => {
    if (!projectId || !selectedEpisodeId) return;
    if (!isApiMode()) return;
    loadEpisodeScenes(projectId, selectedEpisodeId);
  }, [projectId, selectedEpisodeId, loadEpisodeScenes]);

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
                sceneCountHint,
              },
            }
          : n,
      ),
    );
  }, [id, rf, selectedEpisodeId, selectedEpisodeOrder, sceneCountHint]);

  const canRun = Boolean(isApiMode() && projectId && aiProfileId && selectedEpisode?.id);

  const run = async () => {
    if (!projectId || !aiProfileId || !selectedEpisode?.id) return;
    await generateSceneList({
      projectId,
      episodeId: selectedEpisode.id,
      aiProfileId,
      sceneCountHint,
    });
    loadEpisodeScenes(projectId, selectedEpisode.id);
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" />
          {data.label ?? '分镜生成'}
        </span>
      }
      description="为指定 Episode 生成 8-12 条分镜摘要，并写入数据库。"
      headerRight={
        <Button size="sm" onClick={run} disabled={!canRun || isRunning}>
          <Play className="mr-1 h-4 w-4" />
          运行
        </Button>
      }
    >
      {!isApiMode() ? (
        <div className="text-xs text-muted-foreground">
          该节点仅在 API 模式可用（需要后端 + Worker）。
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Episode</div>
            <Select
              value={selectedEpisode?.id ?? ''}
              onValueChange={(nextId) => {
                const ep = episodes.find((e) => e.id === nextId);
                if (!ep) return;
                rf.setNodes((nds) =>
                  nds.map((n) =>
                    n.id === id
                      ? {
                          ...n,
                          data: {
                            ...(n.data as Record<string, unknown>),
                            episodeId: ep.id,
                            episodeOrder: ep.order,
                          },
                        }
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

          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground">条数提示</div>
            <Input
              type="number"
              min={6}
              max={24}
              value={sceneCountHint}
              onChange={(e) => setSceneCountHint(normalizeInt(e.target.value, 10))}
              className="h-8 w-20"
            />
            <Badge variant="secondary" className="text-[11px]">
              当前 scenes：{epScenesLoading ? '…' : epScenes.length}
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
