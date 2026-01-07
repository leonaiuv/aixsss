import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { Layers, Play, RefreshCw, StopCircle } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JsonViewer } from '@/components/ui/json-viewer';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import { apiListEpisodeScenes } from '@/lib/api/episodeScenes';
import { apiWorkflowGenerateKeyframePrompt } from '@/lib/api/workflow';
import { isApiMode } from '@/lib/runtime/mode';
import type { Scene } from '@/types';

type SceneBeatsNodeData = {
  label?: string;
  episodeId?: string;
  episodeOrder?: number;
  sceneId?: string;
  sceneOrder?: number;
};

type NormalizedJobProgress = { pct: number | null; message: string | null };

function normalizeJobProgress(progress: unknown): NormalizedJobProgress {
  const p = progress as { pct?: unknown; message?: unknown } | null;
  const pct = typeof p?.pct === 'number' ? p.pct : null;
  const message = typeof p?.message === 'string' ? p.message : null;
  return { pct, message };
}

export type SceneBeatsFlowNode = Node<SceneBeatsNodeData, 'scene_beats'>;

export function SceneBeatsNode({ id, data }: NodeProps<SceneBeatsFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);
  const aiProfileId = useConfigStore((s) => s.config?.aiProfileId ?? null);

  const episodes = useEpisodeStore((s) => s.episodes);
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes);

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

  const selectedEpisodeId = selectedEpisode?.id ?? null;
  const selectedEpisodeOrder = selectedEpisode?.order ?? null;

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [scenesError, setScenesError] = useState<string | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<NormalizedJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (!isApiMode()) return;
    loadEpisodes(projectId);
  }, [projectId, loadEpisodes]);

  const reloadScenes = useCallback(async () => {
    if (!projectId || !selectedEpisodeId) return;
    if (!isApiMode()) return;
    setScenesLoading(true);
    setScenesError(null);
    try {
      const list = await apiListEpisodeScenes(projectId, selectedEpisodeId);
      setScenes(list as Scene[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setScenesError(message);
    } finally {
      setScenesLoading(false);
    }
  }, [projectId, selectedEpisodeId]);

  useEffect(() => {
    void reloadScenes();
  }, [reloadScenes]);

  const selectedScene = useMemo(() => {
    if (typeof data.sceneId === 'string') return scenes.find((s) => s.id === data.sceneId) ?? null;
    if (typeof data.sceneOrder === 'number')
      return scenes.find((s) => s.order === data.sceneOrder) ?? null;
    return scenes[0] ?? null;
  }, [scenes, data.sceneId, data.sceneOrder]);

  const selectedSceneId = selectedScene?.id ?? null;
  const selectedSceneOrder = selectedScene?.order ?? null;

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
                sceneId: selectedSceneId ?? undefined,
                sceneOrder: selectedSceneOrder ?? undefined,
              },
            }
          : n,
      ),
    );
  }, [id, rf, selectedEpisodeId, selectedEpisodeOrder, selectedSceneId, selectedSceneOrder]);

  const canRun = Boolean(isApiMode() && projectId && aiProfileId && selectedSceneId);

  const run = async () => {
    if (!projectId || !aiProfileId || !selectedSceneId) return;
    setIsRunning(true);
    setError(null);
    setProgress({ pct: 0, message: '准备生成 ActionBeat...' });
    try {
      const job = await apiWorkflowGenerateKeyframePrompt({
        projectId,
        sceneId: selectedSceneId,
        aiProfileId,
      });
      await apiWaitForAIJob(job.id, {
        onProgress: (p) => setProgress(normalizeJobProgress(p)),
        timeoutMs: 30 * 60_000,
      });
      setProgress({ pct: 100, message: '完成' });
      await reloadScenes();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  const actionPlanJson = selectedScene?.actionPlanJson ?? null;
  const keyframeGroupsJson = selectedScene?.keyframeGroupsJson ?? null;

  const beatsCount = useMemo(() => {
    const plan = actionPlanJson as { beats?: unknown } | null;
    return Array.isArray(plan?.beats) ? plan.beats.length : null;
  }, [actionPlanJson]);

  const groupsCount = useMemo(() => {
    const kf = keyframeGroupsJson as { groups?: unknown } | null;
    return Array.isArray(kf?.groups) ? kf.groups.length : null;
  }, [keyframeGroupsJson]);

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          {data.label ?? '动作拆解/关键帧组'}
        </span>
      }
      description="为指定 Scene 生成 beats（三段式）并查看结构化 JSON"
      headerRight={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reloadScenes()}
            disabled={!isApiMode() || !projectId || !selectedEpisodeId || scenesLoading}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            刷新
          </Button>
          <Button size="sm" onClick={run} disabled={!canRun || isRunning}>
            {isRunning ? (
              <StopCircle className="mr-1 h-4 w-4" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {isRunning ? '进行中' : '运行'}
          </Button>
        </div>
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
                            sceneId: undefined,
                            sceneOrder: undefined,
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
                    第{ep.order}集{ep.title ? ` · ${ep.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">Scene</div>
              <Badge variant="secondary" className="text-[11px]">
                {scenesLoading ? '加载中…' : `共 ${scenes.length} 条`}
              </Badge>
            </div>
            <Select
              value={selectedScene?.id ?? ''}
              onValueChange={(nextId) => {
                const s = scenes.find((x) => x.id === nextId);
                if (!s) return;
                rf.setNodes((nds) =>
                  nds.map((n) =>
                    n.id === id
                      ? {
                          ...n,
                          data: {
                            ...(n.data as Record<string, unknown>),
                            sceneId: s.id,
                            sceneOrder: s.order,
                          },
                        }
                      : n,
                  ),
                );
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="选择 Scene" />
              </SelectTrigger>
              <SelectContent>
                {scenes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    #{s.order} {s.summary ? s.summary.slice(0, 30) : '(无摘要)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scenesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {scenesError}
              </div>
            ) : null}
          </div>

          {progress ? (
            <div className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
              <div>{progress.message ?? '执行中…'}</div>
              {typeof progress.pct === 'number' ? (
                <div className="mt-1">进度：{Math.round(progress.pct)}%</div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <Tabs defaultValue="action_plan">
            <TabsList className="w-full">
              <TabsTrigger value="action_plan" className="flex-1">
                ActionPlan
                {typeof beatsCount === 'number' ? ` · ${beatsCount}` : ''}
              </TabsTrigger>
              <TabsTrigger value="keyframe_groups" className="flex-1">
                KeyframeGroups
                {typeof groupsCount === 'number' ? ` · ${groupsCount}` : ''}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="action_plan">
              {actionPlanJson ? (
                <JsonViewer value={actionPlanJson} maxHeightClassName="max-h-[260px]" />
              ) : (
                <div className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
                  尚未生成 actionPlanJson
                </div>
              )}
            </TabsContent>
            <TabsContent value="keyframe_groups">
              {keyframeGroupsJson ? (
                <JsonViewer value={keyframeGroupsJson} maxHeightClassName="max-h-[260px]" />
              ) : (
                <div className="rounded-md border bg-background/60 p-2 text-xs text-muted-foreground">
                  尚未生成 keyframeGroupsJson
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </NodeFrame>
  );
}
