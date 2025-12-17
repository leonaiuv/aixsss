import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { useEpisodeScenesStore } from '@/stores/episodeScenesStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { apiListEpisodeScenes, apiReorderEpisodeScenes } from '@/lib/api/episodeScenes';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import { apiWorkflowRefineSceneAll } from '@/lib/api/workflow';
import { getWorkflowStateLabel } from '@/lib/workflowLabels';
import { isApiMode } from '@/lib/runtime/mode';
import { apiListNarrativeCausalChainVersions } from '@/lib/api/narrativeCausalChainVersions';
import {
  migrateOldStyleToConfig,
  type DialogueLine,
  type Episode,
  type Project,
  type Scene,
} from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  logAICall,
  updateLogProgress,
  updateLogWithError,
  updateLogWithResponse,
} from '@/lib/ai/debugLogger';
import {
  parseSceneAnchorText,
  parseKeyframePromptText,
  parseMotionPromptText,
} from '@/lib/ai/promptParsers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { BasicSettings } from './BasicSettings';
import { SceneSortable } from './SceneSortable';
import { StatisticsPanel } from './StatisticsPanel';
import { NarrativeCausalChainReadable } from './NarrativeCausalChainReadable';
import { NarrativeCausalChainVersionDialog } from './NarrativeCausalChainVersionDialog';
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  History,
  FileText,
  Copy,
  Download,
  Terminal,
  BarChart3,
  MessageSquare,
  Quote,
  User,
  Mic,
  Brain,
} from 'lucide-react';

type WorkflowStep = 'global' | 'causal' | 'plan' | 'episode' | 'export';

const CAUSAL_CHAIN_PHASES = [
  { phase: 1, name: '核心冲突', desc: '故事大纲 + 冲突引擎' },
  { phase: 2, name: '信息分层', desc: '信息能见度层 + 角色矩阵' },
  { phase: 3, name: '节拍流程', desc: '三/四幕结构的节拍设计' },
  { phase: 4, name: '叙事线交织', desc: '明暗线 + 自洽校验' },
] as const;

function getStyleFullPrompt(project: Project | null): string {
  if (!project) return '';
  if (project.artStyleConfig?.fullPrompt) return project.artStyleConfig.fullPrompt;
  if (project.style) return migrateOldStyleToConfig(project.style).fullPrompt;
  return '';
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? '');
  }
}

type NormalizedJobProgress = { pct: number | null; message: string | null };

interface JobProgressLike {
  pct?: unknown;
  message?: unknown;
}

function normalizeJobProgress(progress: unknown): NormalizedJobProgress {
  const p = progress as JobProgressLike | undefined;
  const pct = typeof p?.pct === 'number' ? p.pct : null;
  const message = typeof p?.message === 'string' ? p.message : null;
  return { pct, message };
}

function normalizeJobTokenUsage(
  raw: unknown,
): { prompt: number; completion: number; total: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const prompt = r.prompt;
  const completion = r.completion;
  const total = r.total;
  if (typeof prompt !== 'number' || typeof completion !== 'number' || typeof total !== 'number')
    return undefined;
  return { prompt, completion, total };
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  return false;
}

function getEpisodeStateLabel(state: Episode['workflowState']): string {
  const labels: Record<string, string> = {
    IDLE: '未开始',
    CORE_EXPRESSION_READY: '核心表达已就绪',
    SCENE_LIST_EDITING: '分镜列表可编辑',
    SCENE_PROCESSING: '分镜细化中',
    COMPLETE: '已完成',
  };
  return labels[state] || state;
}

function getSceneStatusLabel(status: Scene['status']): string {
  const labels: Record<string, string> = {
    pending: '待处理',
    scene_generating: '生成场景锚点中',
    scene_confirmed: '场景锚点已就绪',
    keyframe_generating: '生成关键帧中',
    keyframe_confirmed: '关键帧已就绪',
    motion_generating: '生成运动/台词中',
    completed: '已完成',
    needs_update: '需更新',
  };
  return labels[status] || status;
}

function getSceneStatusStyle(status: Scene['status']): {
  label: string;
  className: string;
  dotClass: string;
} {
  const baseLabel = getSceneStatusLabel(status);
  const map: Record<Scene['status'], { className: string; dotClass: string }> = {
    pending: {
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      dotClass: 'bg-amber-500',
    },
    scene_generating: {
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      dotClass: 'bg-sky-500',
    },
    scene_confirmed: {
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      dotClass: 'bg-blue-500',
    },
    keyframe_generating: {
      className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      dotClass: 'bg-indigo-500',
    },
    keyframe_confirmed: {
      className: 'border-purple-200 bg-purple-50 text-purple-700',
      dotClass: 'bg-purple-500',
    },
    motion_generating: {
      className: 'border-amber-300 bg-amber-50 text-amber-800',
      dotClass: 'bg-amber-600',
    },
    completed: {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
    },
    needs_update: {
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      dotClass: 'bg-rose-500',
    },
  };

  const style = map[status];
  if (!style) {
    return {
      label: baseLabel,
      className: 'border-muted bg-muted/30 text-foreground',
      dotClass: 'bg-muted-foreground',
    };
  }
  return { label: baseLabel, ...style };
}

export function EpisodeWorkflow() {
  const { toast } = useToast();
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const { config } = useConfigStore();
  const toggleAIPanel = useAIProgressStore((s) => s.togglePanel);
  const activeAITaskCount = useAIProgressStore(
    (s) => s.tasks.filter((t) => t.status === 'running' || t.status === 'queued').length,
  );
  const { characters, loadCharacters } = useCharacterStore();
  const { elements: worldViewElements, loadElements: loadWorldViewElements } = useWorldViewStore();

  const {
    episodes,
    currentEpisodeId,
    isLoading: isEpisodesLoading,
    isRunningWorkflow,
    error: episodeError,
    lastJobId,
    lastJobProgress,
    loadEpisodes,
    setCurrentEpisode,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    planEpisodes,
    generateCoreExpression,
    generateSceneList,
    buildNarrativeCausalChain,
  } = useEpisodeStore();

  const {
    scenes,
    isLoading: isScenesLoading,
    error: scenesError,
    loadScenes,
    updateScene,
    deleteScene,
    setScenes,
  } = useEpisodeScenesStore();

  const [activeStep, setActiveStep] = useState<WorkflowStep>('global');
  const [targetEpisodeCount, setTargetEpisodeCount] = useState<number | ''>('');
  const [sceneCountHint, setSceneCountHint] = useState<number | ''>('');
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);

  const [coreExpressionDraft, setCoreExpressionDraft] = useState('');
  const [coreExpressionDialogOpen, setCoreExpressionDialogOpen] = useState(false);
  const [coreExpressionDraftError, setCoreExpressionDraftError] = useState<string | null>(null);

  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [narrativeDialogOpen, setNarrativeDialogOpen] = useState(false);
  const [narrativeDraftError, setNarrativeDraftError] = useState<string | null>(null);
  const [runningPhase, setRunningPhase] = useState<number | null>(null); // 追踪当前运行的阶段
  const [rerunPhaseDialogOpen, setRerunPhaseDialogOpen] = useState(false);
  const [pendingRerunPhase, setPendingRerunPhase] = useState<number | null>(null);

  const [refineDialogOpen, setRefineDialogOpen] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [refiningSceneId, setRefiningSceneId] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refineJobProgress, setRefineJobProgress] = useState<NormalizedJobProgress | null>(null);

  const [sortDialogOpen, setSortDialogOpen] = useState(false);

  const [editEpisodeDialogOpen, setEditEpisodeDialogOpen] = useState(false);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [episodeTitleDraft, setEpisodeTitleDraft] = useState('');
  const [episodeSummaryDraft, setEpisodeSummaryDraft] = useState('');
  const [createEpisodeDialogOpen, setCreateEpisodeDialogOpen] = useState(false);
  const [newEpisodeTitleDraft, setNewEpisodeTitleDraft] = useState('');
  const [newEpisodeSummaryDraft, setNewEpisodeSummaryDraft] = useState('');
  const [deleteEpisodeDialogOpen, setDeleteEpisodeDialogOpen] = useState(false);
  const [pendingDeleteEpisode, setPendingDeleteEpisode] = useState<Episode | null>(null);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [chainVersionCount, setChainVersionCount] = useState<number | null>(null);
  const [hasChainUnversionedChanges, setHasChainUnversionedChanges] = useState(false);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  const [exportContent, setExportContent] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentEpisode = useMemo(() => {
    return currentEpisodeId ? (episodes.find((e) => e.id === currentEpisodeId) ?? null) : null;
  }, [currentEpisodeId, episodes]);

  const styleFullPrompt = useMemo(() => getStyleFullPrompt(currentProject), [currentProject]);
  const aiProfileId = config?.aiProfileId ?? null;

  const nextEpisodeOrder = useMemo(() => {
    if (episodes.length === 0) return 1;
    const used = new Set<number>();
    for (const ep of episodes) {
      if (typeof ep.order === 'number' && ep.order >= 1) used.add(ep.order);
    }
    for (let i = 1; i <= 24; i += 1) {
      if (!used.has(i)) return i;
    }
    const max = Math.max(...Array.from(used.values()));
    return max + 1;
  }, [episodes]);

  const canPlan = useMemo(() => {
    const summary = (currentProject?.summary ?? '').trim();
    const hasSummary = summary.length >= 100;
    const hasStyle = Boolean(styleFullPrompt.trim());
    return Boolean(aiProfileId && currentProject?.id && hasSummary && hasStyle);
  }, [aiProfileId, currentProject?.id, currentProject?.summary, styleFullPrompt]);

  useEffect(() => {
    if (!currentProject?.id) return;
    loadEpisodes(currentProject.id);
    loadCharacters(currentProject.id);
    loadWorldViewElements(currentProject.id);
  }, [currentProject?.id, loadEpisodes, loadCharacters, loadWorldViewElements]);

  useEffect(() => {
    if (!currentProject?.id) return;
    if (!currentEpisodeId) return;
    loadScenes(currentProject.id, currentEpisodeId);
  }, [currentProject?.id, currentEpisodeId, loadScenes]);

  useEffect(() => {
    if (!currentEpisode) return;
    setCoreExpressionDraft(safeJsonStringify(currentEpisode.coreExpression));
    setCoreExpressionDraftError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisode?.id]);

  useEffect(() => {
    if (!currentProject) return;
    setNarrativeDraft(safeJsonStringify(currentProject.contextCache?.narrativeCausalChain));
    setNarrativeDraftError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, currentProject?.contextCache?.narrativeCausalChainUpdatedAt]);

  // 版本管理入口提示：版本数量 + “新变更”提示点
  useEffect(() => {
    const projectId = currentProject?.id;
    const narrative = currentProject?.contextCache?.narrativeCausalChain ?? null;
    const updatedAt = currentProject?.contextCache?.narrativeCausalChainUpdatedAt ?? null;
    if (!projectId || !isApiMode()) {
      setChainVersionCount(null);
      setHasChainUnversionedChanges(false);
      return;
    }
    if (!narrative) {
      setChainVersionCount(0);
      setHasChainUnversionedChanges(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const list = await apiListNarrativeCausalChainVersions(projectId, 50);
        if (cancelled) return;
        setChainVersionCount(list.length);

        // “新变更”定义：当前因果链更新时间晚于最新版本创建时间，或当前有因果链但尚无任何版本记录
        if (!updatedAt) {
          setHasChainUnversionedChanges(list.length === 0);
          return;
        }
        const latestCreatedAt = list[0]?.createdAt ?? null;
        if (!latestCreatedAt) {
          setHasChainUnversionedChanges(true);
          return;
        }
        const updatedTs = Date.parse(updatedAt);
        const latestTs = Date.parse(latestCreatedAt);
        setHasChainUnversionedChanges(Number.isFinite(updatedTs) && Number.isFinite(latestTs) ? updatedTs > latestTs : false);
      } catch {
        if (cancelled) return;
        setChainVersionCount(null);
        setHasChainUnversionedChanges(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, currentProject?.contextCache?.narrativeCausalChain, currentProject?.contextCache?.narrativeCausalChainUpdatedAt]);

  const steps: Array<{ id: WorkflowStep; name: string }> = [
    { id: 'global', name: '全局设定' },
    { id: 'causal', name: '叙事因果链' },
    { id: 'plan', name: '剧集规划' },
    { id: 'episode', name: '单集创作' },
    { id: 'export', name: '整合导出' },
  ];

  const handleSaveNarrativeDraft = async () => {
    if (!currentProject?.id) return;
    try {
      const parsed = JSON.parse(narrativeDraft) as unknown;
      setNarrativeDraftError(null);
      const base =
        currentProject.contextCache && typeof currentProject.contextCache === 'object'
          ? (currentProject.contextCache as Record<string, unknown>)
          : {};
      updateProject(currentProject.id, {
        contextCache: {
          ...base,
          narrativeCausalChain: parsed,
          narrativeCausalChainUpdatedAt: new Date().toISOString(),
        },
      });
      toast({ title: '已保存', description: '叙事因果链已更新。' });
      setNarrativeDialogOpen(false);
    } catch (error) {
      setNarrativeDraftError(error instanceof Error ? error.message : String(error));
    }
  };

  const handlePlanEpisodes = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    try {
      toast({ title: '开始剧集规划', description: '已入队，正在等待 AI 完成...' });
      await planEpisodes({
        projectId: currentProject.id,
        aiProfileId,
        targetEpisodeCount: typeof targetEpisodeCount === 'number' ? targetEpisodeCount : undefined,
      });
      toast({ title: '剧集规划完成', description: '已写入 Episodes，可继续单集创作。' });
      setActiveStep('plan');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '剧集规划失败', description: detail, variant: 'destructive' });
    }
  };

  const handleGenerateCoreExpression = async () => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    try {
      toast({ title: '生成核心表达', description: '已入队，正在等待 AI 完成...' });
      await generateCoreExpression({
        projectId: currentProject.id,
        episodeId: currentEpisode.id,
        aiProfileId,
      });
      toast({ title: '核心表达已生成', description: `第 ${currentEpisode.order} 集已就绪。` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '核心表达生成失败', description: detail, variant: 'destructive' });
    }
  };

  const handleSaveCoreExpressionDraft = async () => {
    if (!currentProject?.id || !currentEpisode?.id) return;
    try {
      const parsed = JSON.parse(coreExpressionDraft) as unknown;
      setCoreExpressionDraftError(null);
      await updateEpisode(currentProject.id, currentEpisode.id, { coreExpression: parsed });
      toast({ title: '已保存', description: '核心表达已更新。' });
      setCoreExpressionDialogOpen(false);
    } catch (error) {
      setCoreExpressionDraftError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleGenerateSceneList = async () => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    try {
      toast({ title: '生成分镜列表', description: '已入队，正在等待 AI 完成...' });
      await generateSceneList({
        projectId: currentProject.id,
        episodeId: currentEpisode.id,
        aiProfileId,
        sceneCountHint: typeof sceneCountHint === 'number' ? sceneCountHint : undefined,
      });
      toast({ title: '分镜列表已生成', description: `第 ${currentEpisode.order} 集分镜已写入。` });
      loadScenes(currentProject.id, currentEpisode.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '分镜生成失败', description: detail, variant: 'destructive' });
    }
  };

  const handleRefineSceneAll = async (sceneId: string) => {
    if (!aiProfileId || !currentProject?.id) return;
    const currentScene = scenes.find((s) => s.id === sceneId);

    const logId = logAICall('scene_refine_all', {
      skillName: 'workflow:refine_scene_all',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/scenes/{{sceneId}}/refine-all',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/scenes/${sceneId}/refine-all`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            sceneId,
            aiProfileId,
            sceneOrder: currentScene?.order,
            sceneSummary: currentScene?.summary,
          }),
        },
      ],
      context: {
        projectId: currentProject.id,
        sceneId,
        sceneOrder: currentScene?.order,
        sceneSummary: currentScene?.summary,
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    setIsRefining(true);
    setRefiningSceneId(sceneId);
    setRefineJobProgress(null);
    try {
      const job = await apiWorkflowRefineSceneAll({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
      });

      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          setRefineJobProgress(next);
          if (typeof next.pct === 'number')
            updateLogProgress(logId, next.pct, next.message ?? undefined);
        },
      });

      const result = (finished.result ?? null) as unknown;
      const tokenUsage = normalizeJobTokenUsage(
        result && typeof result === 'object'
          ? (result as { tokenUsage?: unknown }).tokenUsage
          : null,
      );
      updateLogWithResponse(logId, { content: safeJsonStringify(result), tokenUsage });

      if (currentEpisode?.id) loadScenes(currentProject.id, currentEpisode.id);
      toast({ title: '分镜细化完成', description: '已更新当前分镜内容。' });
    } catch (error) {
      if (!isAbortError(error)) {
        const detail = error instanceof Error ? error.message : String(error);
        updateLogWithError(logId, detail);
        toast({ title: '分镜细化失败', description: detail, variant: 'destructive' });
      }
    } finally {
      setIsRefining(false);
      setRefiningSceneId(null);
      setRefineJobProgress(null);
    }
  };

  const openEpisodeEditor = (episode: Episode) => {
    setEditingEpisodeId(episode.id);
    setEpisodeTitleDraft(episode.title || '');
    setEpisodeSummaryDraft(episode.summary || '');
    setEditEpisodeDialogOpen(true);
  };

  const handleSaveEpisodeEdits = async () => {
    if (!currentProject?.id || !editingEpisodeId) return;
    try {
      await updateEpisode(currentProject.id, editingEpisodeId, {
        title: episodeTitleDraft,
        summary: episodeSummaryDraft,
      });
      toast({ title: '已保存', description: 'Episode 已更新。' });
      setEditEpisodeDialogOpen(false);
      setEditingEpisodeId(null);
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const openCreateEpisodeDialog = () => {
    setNewEpisodeTitleDraft('');
    setNewEpisodeSummaryDraft('');
    setCreateEpisodeDialogOpen(true);
  };

  const handleCreateEpisodeManual = async () => {
    if (!currentProject?.id) return;
    if (nextEpisodeOrder > 24) {
      toast({
        title: '无法新增',
        description:
          '当前 Episode 数量已达到 24（UI 推荐上限）。如需更多集数，请先删除或调整规划。',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createEpisode(currentProject.id, {
        order: nextEpisodeOrder,
        title: newEpisodeTitleDraft,
        summary: newEpisodeSummaryDraft,
      });
      toast({ title: '已新增', description: `已创建第 ${nextEpisodeOrder} 集。` });
      setCreateEpisodeDialogOpen(false);
      setNewEpisodeTitleDraft('');
      setNewEpisodeSummaryDraft('');
    } catch (error) {
      toast({
        title: '新增失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const openDeleteEpisodeConfirm = (episode: Episode) => {
    setPendingDeleteEpisode(episode);
    setDeleteEpisodeDialogOpen(true);
  };

  const handleDeleteEpisodeConfirmed = async () => {
    if (!currentProject?.id || !pendingDeleteEpisode) return;
    const toDelete = pendingDeleteEpisode;
    const deletedOrder = toDelete.order;
    try {
      await deleteEpisode(currentProject.id, toDelete.id);

      // 保持 order 连续：将后续集数整体前移一位（避免出现缺口）
      const toShift = episodes
        .filter((e) => e.id !== toDelete.id && e.order > deletedOrder)
        .slice()
        .sort((a, b) => a.order - b.order);
      for (const ep of toShift) {
        await updateEpisode(currentProject.id, ep.id, { order: ep.order - 1 });
      }

      toast({
        title: '已删除',
        description: `已删除第 ${deletedOrder} 集，并自动重排后续集数。`,
      });
      setDeleteEpisodeDialogOpen(false);
      setPendingDeleteEpisode(null);
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleBuildExport = async () => {
    if (!currentProject?.id) return;
    setIsExporting(true);
    setExportContent('');
    try {
      const scenesByEpisode = await Promise.all(
        episodes.map(async (ep) => {
          try {
            const epScenes = await apiListEpisodeScenes(currentProject.id, ep.id);
            return [ep.id, epScenes as Scene[]] as const;
          } catch {
            return [ep.id, [] as Scene[]] as const;
          }
        }),
      );

      const sceneMap = new Map<string, Scene[]>();
      scenesByEpisode.forEach(([id, epScenes]) => sceneMap.set(id, epScenes));

      if (exportFormat === 'json') {
        const data = {
          project: currentProject,
          globalSettings: {
            artStyleFullPrompt: styleFullPrompt,
            worldView: worldViewElements,
            characters: projectCharacters,
            narrativeCausalChain: currentProject.contextCache?.narrativeCausalChain ?? null,
          },
          episodes: episodes.map((ep) => ({ ...ep, scenes: sceneMap.get(ep.id) ?? [] })),
          exportedAt: new Date().toISOString(),
        };
        setExportContent(JSON.stringify(data, null, 2));
      } else {
        let md = `# ${currentProject.title}\n\n`;
        md += `## 全局设定\n\n`;
        md += `### 故事梗概

${currentProject.summary || '-'}

`;
        md += `### 画风（Full Prompt）

\`\`\`
${styleFullPrompt || '-'}
\`\`\`

`;

        md += `### 世界观\n\n`;
        if (worldViewElements.length === 0) md += `- （空）\n\n`;
        else {
          worldViewElements
            .slice()
            .sort((a, b) => a.order - b.order)
            .forEach((w) => {
              md += `- (${w.order}) [${w.type}] ${w.title}: ${w.content}\n`;
            });
          md += '\n';
        }

        md += `### 角色库\n\n`;
        if (projectCharacters.length === 0) md += `- （空）\n\n`;
        else {
          projectCharacters.forEach((c) => {
            md += `- ${c.name}\n`;
          });
          md += '\n';
        }

        md += `### 叙事因果链（JSON）\n\n`;
        md += `\`\`\`json\n`;
        md += `${safeJsonStringify(currentProject.contextCache?.narrativeCausalChain)}\n`;
        md += `\`\`\`\n\n`;

        md += `## 剧集规划与单集产物\n\n`;
        for (const ep of episodes) {
          md += `### 第 ${ep.order} 集：${ep.title || '(未命名)'}\n\n`;
          md += `- 一句话概要：${ep.summary || '-'}\n`;
          md += `- 工作流状态：${getEpisodeStateLabel(ep.workflowState)}\n\n`;

          if (ep.outline) {
            md += `#### Outline（JSON）

\`\`\`json
${safeJsonStringify(ep.outline)}
\`\`\`

`;
          }

          if (ep.coreExpression) {
            md += `#### 核心表达（Core Expression）

\`\`\`json
${safeJsonStringify(ep.coreExpression)}
\`\`\`

`;
          }

          const epScenes = sceneMap.get(ep.id) ?? [];
          md += `#### 分镜列表（${epScenes.length}）\n\n`;
          if (epScenes.length === 0) {
            md += `- （空）\n\n`;
          } else {
            epScenes
              .slice()
              .sort((a, b) => a.order - b.order)
              .forEach((s) => {
                md += `- ${s.order}. ${s.summary}\n`;
              });
            md += '\n';
          }
        }

        setExportContent(md);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '导出失败', description: detail, variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: '复制失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleCopyDialogues = async (dialogues: DialogueLine[]) => {
    try {
      await navigator.clipboard.writeText(safeJsonStringify(dialogues));
      toast({ title: '已复制', description: '台词 JSON 已复制到剪贴板。' });
    } catch (error) {
      toast({
        title: '复制失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleDownloadExport = () => {
    const filename = `episode-export-${currentProject?.id ?? 'unknown'}-${Date.now()}.${exportFormat === 'json' ? 'json' : 'md'}`;
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStepStatus = (step: WorkflowStep): 'completed' | 'current' | 'pending' => {
    if (step === activeStep) return 'current';
    const order: WorkflowStep[] = ['global', 'causal', 'plan', 'episode', 'export'];
    return order.indexOf(step) < order.indexOf(activeStep) ? 'completed' : 'pending';
  };

  const handleCausalPhase = async (phase: number, opts?: { force?: boolean }) => {
    if (!aiProfileId || !currentProject?.id) return;
    const meta = CAUSAL_CHAIN_PHASES.find((p) => p.phase === phase);
    if (!meta) return;
    setRunningPhase(phase);
    try {
      const isForce = opts?.force === true;
      toast({
        title: isForce ? `重新生成阶段 ${phase}` : `开始阶段 ${phase}`,
        description: isForce ? `强制重生成（忽略缓存）：${meta.desc}` : meta.desc,
      });
      await buildNarrativeCausalChain({
        projectId: currentProject.id,
        aiProfileId,
        phase,
        ...(isForce ? { force: true } : {}),
      });
      toast({ title: isForce ? `阶段 ${phase} 已重新生成` : `阶段 ${phase} 完成`, description: meta.name });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: `阶段 ${phase} 失败`, description: detail, variant: 'destructive' });
    } finally {
      setRunningPhase(null);
    }
  };

  const renderCausalStep = () => {
    const summaryLen = (currentProject?.summary ?? '').trim().length;
    const hasStyle = Boolean(styleFullPrompt.trim());
    const missing: string[] = [];
    if (summaryLen < 100) missing.push('故事梗概 ≥ 100 字');
    if (!hasStyle) missing.push('画风（Full Prompt）');
    if (!aiProfileId) missing.push('AI Profile（在「设置」中选择）');

    const narrative = currentProject?.contextCache?.narrativeCausalChain ?? null;
    const updatedAt = currentProject?.contextCache?.narrativeCausalChainUpdatedAt ?? null;

    // 分阶段信息
    const completedPhase = (narrative as { completedPhase?: number } | null)?.completedPhase ?? 0;
    const validationStatus =
      (narrative as { validationStatus?: string } | null)?.validationStatus ?? 'incomplete';
    const outlineSummary =
      (narrative as { outlineSummary?: string } | null)?.outlineSummary ?? null;

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">叙事因果链（分阶段生成）</h2>
              <p className="text-sm text-muted-foreground">
                将复杂的因果链拆分为 4 个阶段，每阶段专注一个模块，AI 输出更稳定。
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={summaryLen >= 100 ? 'default' : 'destructive'}>
                  梗概 {summaryLen}/100
                </Badge>
                <Badge variant={hasStyle ? 'default' : 'destructive'}>
                  画风 {hasStyle ? 'OK' : '缺失'}
                </Badge>
                <Badge variant={worldViewElements.length > 0 ? 'secondary' : 'outline'}>
                  世界观 {worldViewElements.length}
                </Badge>
                <Badge variant={projectCharacters.length > 0 ? 'secondary' : 'outline'}>
                  角色 {projectCharacters.length}
                </Badge>
                <Badge
                  variant={
                    completedPhase >= 4 ? 'default' : completedPhase > 0 ? 'secondary' : 'outline'
                  }
                >
                  进度 {completedPhase}/4
                </Badge>
                {validationStatus === 'pass' ? (
                  <Badge variant="default">✓ 自洽校验通过</Badge>
                ) : validationStatus === 'needs_revision' ? (
                  <Badge variant="destructive">需修订</Badge>
                ) : null}
              </div>
              {missing.length > 0 ? (
                <p className="text-sm text-destructive">缺少：{missing.join('、')}</p>
              ) : null}
              {updatedAt ? (
                <p className="text-xs text-muted-foreground">
                  最近更新：{new Date(updatedAt).toLocaleString('zh-CN')}
                </p>
              ) : null}
            </div>

            <div className="w-full max-w-md space-y-3">
              {/* 分阶段按钮 */}
              <div className="grid grid-cols-2 gap-2">
                {CAUSAL_CHAIN_PHASES.map((p) => {
                  const isCompleted = completedPhase >= p.phase;
                  const isNext = completedPhase === p.phase - 1;
                  const isRunningThisPhase = runningPhase === p.phase;
                  // 关键修复：任何阶段运行时禁用所有按钮（防止竞态条件）
                  const isAnyPhaseRunning = runningPhase !== null || isRunningWorkflow;
                  const canTrigger = canPlan && !isAnyPhaseRunning;
                  const canRunMain = canTrigger && isNext;
                  const canRerun = canTrigger && isCompleted;

                  return (
                    <div key={p.phase} className="flex w-full gap-2">
                      <Button
                        onClick={() => void handleCausalPhase(p.phase)}
                        disabled={!canRunMain}
                        variant={isCompleted ? 'secondary' : isNext ? 'default' : 'outline'}
                        className={`flex-1 gap-1 text-xs h-auto py-2 ${isCompleted ? 'disabled:opacity-100' : ''}`}
                      >
                        {isRunningThisPhase ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isCompleted ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="opacity-50">{p.phase}</span>
                        )}
                        <span className="truncate">{p.name}</span>
                      </Button>

                      {/* 仅在“已完成阶段”后显示：独立的重新生成按钮（避免误点主按钮） */}
                      {isCompleted ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canRerun}
                          className="h-auto py-2 px-2 shrink-0"
                          aria-label={`重新生成阶段 ${p.phase} ${p.name}`}
                          onClick={() => {
                            setPendingRerunPhase(p.phase);
                            setRerunPhaseDialogOpen(true);
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setNarrativeDialogOpen(true)}
                  disabled={!currentProject?.id}
                  className="flex-1"
                  size="sm"
                >
                  编辑 JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setVersionDialogOpen(true)}
                  disabled={!currentProject?.id}
                  className="flex-1 gap-2 relative"
                  size="sm"
                >
                  {hasChainUnversionedChanges ? (
                    <span
                      className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-background"
                      aria-label="有新变更未记录为版本"
                      title="有新变更未记录为版本"
                    />
                  ) : null}
                  <History className="h-4 w-4" />
                  版本
                  {typeof chainVersionCount === 'number' ? (
                    <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1 text-[11px] font-medium rounded-full bg-muted text-foreground">
                      {chainVersionCount}
                    </span>
                  ) : null}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setActiveStep('plan')}
                  disabled={completedPhase < 1}
                  className="flex-1"
                  size="sm"
                >
                  下一步
                </Button>
              </div>

              {isRunningWorkflow ? (
                <div className="pt-2 space-y-2">
                  <Progress
                    value={typeof lastJobProgress?.pct === 'number' ? lastJobProgress.pct : 0}
                  />
                  <div className="text-xs text-muted-foreground">
                    {lastJobProgress?.message || '排队中...'}
                    {lastJobId ? ` · jobId=${lastJobId}` : null}
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                ⏱ 每阶段约 30-60s。可在「AI 调试面板」查看详细日志。
              </p>
            </div>
          </div>
        </Card>

        {/* 大纲摘要 */}
        {outlineSummary ? (
          <Card className="p-6 border-l-4 border-l-primary">
            <h3 className="font-semibold mb-2">故事大纲摘要（阶段1产物）</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{outlineSummary}</p>
          </Card>
        ) : null}

        {/* 完整 JSON */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">因果链产物（JSON）</h3>
            <div className="text-sm text-muted-foreground">
              {completedPhase >= 4
                ? '全部完成'
                : completedPhase > 0
                  ? `已完成 ${completedPhase}/4 阶段`
                  : '暂无产物'}
            </div>
          </div>
          <Separator className="my-4" />
          {narrative ? (
            <JsonViewer value={narrative} />
          ) : (
            <div className="text-sm text-muted-foreground">
              点击上方按钮开始分阶段生成。建议先完善世界观与角色关系。
            </div>
          )}
        </Card>

        {/* 可读版：用于快速阅读与兼容扩展字段 */}
        {narrative ? (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">因果链产物（可读版）</h3>
              <div className="text-sm text-muted-foreground">结构化阅读 · 扩展字段不丢失</div>
            </div>
            <Separator className="my-4" />
            <NarrativeCausalChainReadable value={narrative} />
          </Card>
        ) : null}

      </div>
    );
  };

  const renderPlanStep = () => {
    const summaryLen = (currentProject?.summary ?? '').trim().length;
    const hasStyle = Boolean(styleFullPrompt.trim());
    const hasCausalChain = Boolean(currentProject?.contextCache?.narrativeCausalChain);
    const missing: string[] = [];
    if (summaryLen < 100) missing.push('故事梗概 ≥ 100 字');
    if (!hasStyle) missing.push('画风（Full Prompt）');
    if (!hasCausalChain) missing.push('叙事因果链（请先生成）');
    if (!aiProfileId) missing.push('AI Profile（在「设置」中选择）');

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">剧集规划</h2>
              <p className="text-sm text-muted-foreground">
                输入：全局设定（梗概/画风/世界观/角色） → 输出：N 集规划（可编辑）
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={summaryLen >= 100 ? 'default' : 'destructive'}>
                  梗概 {summaryLen}/100
                </Badge>
                <Badge variant={hasStyle ? 'default' : 'destructive'}>
                  画风 {hasStyle ? 'OK' : '缺失'}
                </Badge>
                <Badge variant={hasCausalChain ? 'default' : 'destructive'}>
                  因果链 {hasCausalChain ? 'OK' : '缺失'}
                </Badge>
                <Badge variant={worldViewElements.length > 0 ? 'secondary' : 'outline'}>
                  世界观 {worldViewElements.length}
                </Badge>
                <Badge variant={projectCharacters.length > 0 ? 'secondary' : 'outline'}>
                  角色 {projectCharacters.length}
                </Badge>
              </div>
              {missing.length > 0 ? (
                <p className="text-sm text-destructive">缺少：{missing.join('、')}</p>
              ) : null}
            </div>

            <div className="w-full max-w-sm space-y-3">
              <div className="space-y-2">
                <Label htmlFor="targetEpisodeCount">目标集数（可选 1..24）</Label>
                <Input
                  id="targetEpisodeCount"
                  type="number"
                  min={1}
                  max={24}
                  value={targetEpisodeCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTargetEpisodeCount(v ? Number(v) : '');
                  }}
                  placeholder="留空表示让 AI 推荐"
                />
              </div>
              <Button
                onClick={handlePlanEpisodes}
                disabled={!canPlan || !hasCausalChain || isRunningWorkflow}
                className="w-full gap-2"
              >
                {isRunningWorkflow ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>生成/覆盖剧集规划</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => currentProject?.id && loadEpisodes(currentProject.id)}
                disabled={!currentProject?.id || isEpisodesLoading}
                className="w-full gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>刷新 Episodes</span>
              </Button>

              {isRunningWorkflow ? (
                <div className="pt-2 space-y-2">
                  <Progress
                    value={typeof lastJobProgress?.pct === 'number' ? lastJobProgress.pct : 0}
                  />
                  <div className="text-xs text-muted-foreground">
                    {lastJobProgress?.message || '排队中...'}
                    {lastJobId ? `（jobId=${lastJobId}）` : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Episodes（按集数排序）</h3>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                {isEpisodesLoading ? '加载中...' : `${episodes.length} 集`}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={openCreateEpisodeDialog}
                disabled={!currentProject?.id || isRunningWorkflow}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                新增
              </Button>
            </div>
          </div>
          <Separator className="my-4" />

          {episodeError ? (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {episodeError}
            </div>
          ) : null}

          {episodes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              暂无 Episodes，请先生成剧集规划。
            </div>
          ) : (
            <div className="space-y-3">
              {episodes.map((ep) => (
                <div key={ep.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">第 {ep.order} 集</Badge>
                        <span className="font-medium">{ep.title || '(未命名)'}</span>
                        <Badge variant="outline">{getEpisodeStateLabel(ep.workflowState)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {ep.summary || '（无一句话概要）'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDeleteEpisodeConfirm(ep)}
                        disabled={isRunningWorkflow}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEpisodeEditor(ep)}>
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setCurrentEpisode(ep.id);
                          setActiveStep('episode');
                        }}
                      >
                        进入单集创作
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderEpisodeStep = () => {
    const hasEpisode = Boolean(currentEpisode?.id);
    const hasCoreExpression = Boolean(currentEpisode?.coreExpression);
    const canGenerateSceneList = Boolean(hasEpisode && hasCoreExpression && aiProfileId);

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">单集创作</h2>
              <p className="text-sm text-muted-foreground">
                核心表达 → 分镜生成 → 分镜细化（复用现有 scene 级 workflow）
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <div className="space-y-2">
                <Label htmlFor="episodeSelect">选择 Episode</Label>
                <select
                  id="episodeSelect"
                  className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={currentEpisodeId ?? ''}
                  onChange={(e) => setCurrentEpisode(e.target.value || null)}
                >
                  <option value="">请选择</option>
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      第 {ep.order} 集：{ep.title || '(未命名)'}
                    </option>
                  ))}
                </select>
              </div>
              {currentEpisode ? (
                <div className="text-sm text-muted-foreground">
                  状态：{getEpisodeStateLabel(currentEpisode.workflowState)}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {!hasEpisode ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            请先从「剧集规划」进入某一集，或在上方下拉选择。
          </Card>
        ) : (
          <Tabs defaultValue="core" className="w-full">
            <TabsList>
              <TabsTrigger value="core">核心表达</TabsTrigger>
              <TabsTrigger value="scenes">分镜列表</TabsTrigger>
              <TabsTrigger value="refine">分镜细化</TabsTrigger>
            </TabsList>

            <TabsContent value="core" className="space-y-4">
              <Card className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold">核心表达（Core Expression）</h3>
                    <p className="text-sm text-muted-foreground">
                      结构化 JSON，决定该集的主题/情绪主线/冲突与结尾钩子。
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleGenerateCoreExpression}
                      disabled={!aiProfileId || isRunningWorkflow}
                      className="gap-2"
                    >
                      {isRunningWorkflow ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>AI 生成</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCoreExpressionDialogOpen(true)}
                      disabled={!currentEpisode}
                    >
                      编辑 JSON
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                {currentEpisode?.coreExpression ? (
                  <JsonViewer value={currentEpisode.coreExpression} />
                ) : (
                  <div className="text-sm text-muted-foreground">尚未生成核心表达。</div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="scenes" className="space-y-4">
              <Card className="p-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-2">
                    <h3 className="font-semibold">分镜列表（Storyboard / Scene List）</h3>
                    <p className="text-sm text-muted-foreground">
                      AI 会为本集生成 8-12 条分镜概要，并写入数据库（覆盖式）。
                    </p>
                  </div>
                  <div className="w-full max-w-sm space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="sceneCountHint">分镜数量提示（可选 6..24）</Label>
                      <Input
                        id="sceneCountHint"
                        type="number"
                        min={6}
                        max={24}
                        value={sceneCountHint}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSceneCountHint(v ? Number(v) : '');
                        }}
                        placeholder="留空默认 12（可选 6..24）"
                      />
                    </div>
                    <Button
                      onClick={handleGenerateSceneList}
                      disabled={!canGenerateSceneList || isRunningWorkflow}
                      className="w-full gap-2"
                    >
                      {isRunningWorkflow ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>AI 生成分镜列表</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        currentEpisode?.id &&
                        currentProject?.id &&
                        loadScenes(currentProject.id, currentEpisode.id)
                      }
                      disabled={!currentEpisode?.id || isScenesLoading}
                      className="w-full gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>刷新分镜</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSortDialogOpen(true)}
                      disabled={scenes.length < 2}
                      className="w-full"
                    >
                      拖拽排序
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                {scenesError ? (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    {scenesError}
                  </div>
                ) : null}

                {isScenesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>加载分镜中...</span>
                  </div>
                ) : scenes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">当前 Episode 暂无分镜。</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {scenes
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((scene) => (
                          <div key={scene.id} className="rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">#{scene.order}</Badge>
                                  {(() => {
                                    const statusStyle = getSceneStatusStyle(scene.status);
                                    return (
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}
                                      >
                                        <span
                                          className={`h-2 w-2 rounded-full ${statusStyle.dotClass}`}
                                        />
                                        {statusStyle.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRefineDialogOpen(true);
                                    setSelectedSceneId(scene.id);
                                  }}
                                >
                                  查看/编辑
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleRefineSceneAll(scene.id)}
                                  disabled={!aiProfileId || isRefining}
                                  className="gap-2"
                                >
                                  {isRefining && refiningSceneId === scene.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                  <span>一键细化</span>
                                </Button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              <Label className="text-xs text-muted-foreground">分镜概要</Label>
                              <Textarea
                                value={scene.summary}
                                onChange={(e) =>
                                  currentEpisode?.id &&
                                  currentProject?.id &&
                                  updateScene(currentProject.id, currentEpisode.id, scene.id, {
                                    summary: e.target.value,
                                  })
                                }
                                className="min-h-[60px]"
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="refine" className="space-y-4">
              <Card className="p-6">
                <div className="space-y-2">
                  <h3 className="font-semibold">分镜细化</h3>
                  <p className="text-sm text-muted-foreground">
                    目前提供「一键细化」与字段编辑；细化任务由后端 worker 执行并写回 Scene。
                  </p>
                </div>
                <Separator className="my-4" />
                {scenes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无分镜，请先生成分镜列表。</div>
                ) : (
                  <div className="space-y-3">
                    {scenes
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((scene) => (
                        <div key={scene.id} className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">#{scene.order}</Badge>
                                {(() => {
                                  const statusStyle = getSceneStatusStyle(scene.status);
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}
                                    >
                                      <span
                                        className={`h-2 w-2 rounded-full ${statusStyle.dotClass}`}
                                      />
                                      {statusStyle.label}
                                    </span>
                                  );
                                })()}
                              </div>
                              <p className="text-sm mt-2 truncate">{scene.summary}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRefineDialogOpen(true);
                                  setSelectedSceneId(scene.id);
                                }}
                              >
                                打开详情
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRefineSceneAll(scene.id)}
                                disabled={!aiProfileId || isRefining}
                                className="gap-2"
                              >
                                {isRefining && refiningSceneId === scene.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                                <span>一键细化</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    );
  };

  const renderExportStep = () => {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">整合导出</h2>
              <p className="text-sm text-muted-foreground">
                导出包含：全局设定 + Episode Plan + 每集核心表达 + 分镜列表。
              </p>
            </div>

            <div className="w-full max-w-sm space-y-3">
              <div className="space-y-2">
                <Label>导出格式</Label>
                <div className="flex gap-2">
                  <Button
                    variant={exportFormat === 'markdown' ? 'default' : 'outline'}
                    onClick={() => setExportFormat('markdown')}
                    size="sm"
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Markdown</span>
                  </Button>
                  <Button
                    variant={exportFormat === 'json' ? 'default' : 'outline'}
                    onClick={() => setExportFormat('json')}
                    size="sm"
                    className="gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    <span>JSON</span>
                  </Button>
                </div>
              </div>

              <Button onClick={() => setExportDialogOpen(true)} className="w-full gap-2">
                <Download className="h-4 w-4" />
                <span>生成并预览导出</span>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const refineScene = selectedSceneId
    ? (scenes.find((s) => s.id === selectedSceneId) ?? null)
    : null;

  // 解析场景锚点
  const parsedRefineSceneAnchor = useMemo(() => {
    return parseSceneAnchorText(refineScene?.sceneDescription || '');
  }, [refineScene?.sceneDescription]);

  // 解析关键帧提示词
  const parsedRefineKeyframes = useMemo(() => {
    return parseKeyframePromptText(refineScene?.shotPrompt || '');
  }, [refineScene?.shotPrompt]);

  // 解析运动提示词
  const parsedRefineMotion = useMemo(() => {
    return parseMotionPromptText(refineScene?.motionPrompt || '');
  }, [refineScene?.motionPrompt]);

  // 场景锚点复制文本：组合 SCENE_ANCHOR + LOCK + AVOID（纯文本，无标签）
  const refineSceneAnchorCopyText = useMemo(() => {
    const raw = (refineScene?.sceneDescription || '').trim();
    if (!raw) return { zh: '', en: '' };
    if (!parsedRefineSceneAnchor.isStructured) {
      return { zh: raw, en: raw };
    }
    const buildCopyText = (locale: 'zh' | 'en') => {
      const parts: string[] = [];
      if (parsedRefineSceneAnchor.sceneAnchor[locale]) {
        parts.push(parsedRefineSceneAnchor.sceneAnchor[locale]!);
      }
      if (parsedRefineSceneAnchor.lock?.[locale]) {
        parts.push(parsedRefineSceneAnchor.lock[locale]!);
      }
      if (parsedRefineSceneAnchor.avoid?.[locale]) {
        parts.push(parsedRefineSceneAnchor.avoid[locale]!);
      }
      return parts.join('\n\n').trim();
    };
    return {
      zh: buildCopyText('zh'),
      en: buildCopyText('en'),
    };
  }, [parsedRefineSceneAnchor, refineScene?.sceneDescription]);

  // 通用复制到剪贴板函数
  const copyToClipboard = async (text: string, title: string, description?: string) => {
    if (!text) {
      toast({ title: '暂无可复制内容', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title, description });
    } catch (error) {
      toast({
        title: '复制失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const handleCopySceneAnchor = async (locale: 'zh' | 'en') => {
    const text = locale === 'zh' ? refineSceneAnchorCopyText.zh : refineSceneAnchorCopyText.en;
    if (!text) {
      toast({
        title: '暂无可复制内容',
        description: parsedRefineSceneAnchor.isStructured
          ? `未检测到 ${locale.toUpperCase()} 的内容。`
          : '请先填写或生成场景锚点。',
        variant: 'destructive',
      });
      return;
    }
    await copyToClipboard(
      text,
      '已复制',
      locale === 'zh'
        ? '场景锚点（中文，含 LOCK/AVOID）已复制。'
        : '场景锚点（英文，含 LOCK/AVOID）已复制。',
    );
  };

  // 关键帧复制处理
  const handleCopyKeyframe = async (kfIndex: 0 | 1 | 2, locale: 'zh' | 'en') => {
    const kfLabels = ['KF0（起始）', 'KF1（中间）', 'KF2（结束）'];
    const kf = parsedRefineKeyframes.keyframes[kfIndex];
    const text = kf[locale] || '';
    await copyToClipboard(text, '已复制', `${kfLabels[kfIndex]} ${locale.toUpperCase()} 已复制。`);
  };

  const handleCopyKeyframeAvoid = async (locale: 'zh' | 'en') => {
    const text = parsedRefineKeyframes.avoid?.[locale] || '';
    await copyToClipboard(text, '已复制', `AVOID ${locale.toUpperCase()} 已复制。`);
  };

  // 运动提示词复制处理
  const handleCopyMotion = async (
    block: 'motionShort' | 'motionBeats' | 'constraints',
    locale: 'zh' | 'en',
  ) => {
    const labels: Record<string, string> = {
      motionShort: 'MOTION_SHORT',
      motionBeats: 'MOTION_BEATS',
      constraints: 'CONSTRAINTS',
    };
    const text = parsedRefineMotion[block][locale] || '';
    await copyToClipboard(text, '已复制', `${labels[block]} ${locale.toUpperCase()} 已复制。`);
  };

  if (!currentProject) return null;
  const workflowLabel = getWorkflowStateLabel(currentProject.workflowState);
  const projectCharacters = characters.filter((c) => c.projectId === currentProject.id);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{currentProject.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              项目工作流：{workflowLabel} · Episodes：{episodes.length}
            </p>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatsDialogOpen(true)}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">统计分析</span>
            </Button>
            <Button variant="outline" size="sm" onClick={toggleAIPanel} className="gap-2">
              <Terminal className="h-4 w-4" />
              <span className="hidden sm:inline">AI 面板</span>
              {activeAITaskCount > 0 ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeAITaskCount}
                </Badge>
              ) : null}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveStep('global')}>
              回到全局设定
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[240px_1fr] gap-6 min-h-[calc(100vh-260px)]">
        <Card className="p-6 h-fit sticky top-24">
          <h3 className="font-semibold mb-4">Episode 工作流</h3>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const status = getStepStatus(step.id);
              return (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : status === 'current' ? (
                      <div className="h-5 w-5 rounded-full border-2 border-primary bg-primary/20" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    {index < steps.length - 1 && (
                      <div
                        className={`w-0.5 h-8 mt-2 ${status === 'completed' ? 'bg-primary' : 'bg-border'}`}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => setActiveStep(step.id)}
                    className="text-left transition-colors cursor-pointer hover:text-primary"
                  >
                    <p
                      className={`text-sm font-medium ${
                        status === 'current' ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {step.name}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          {activeStep === 'global' && (
            <BasicSettings
              minSummaryLength={100}
              proceedText="确认并进入叙事因果链"
              onProceed={() => setActiveStep('causal')}
            />
          )}
          {activeStep === 'causal' && renderCausalStep()}
          {activeStep === 'plan' && renderPlanStep()}
          {activeStep === 'episode' && renderEpisodeStep()}
          {activeStep === 'export' && renderExportStep()}
        </div>
      </div>

      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>统计分析</DialogTitle>
          </DialogHeader>
          <StatisticsPanel
            projectId={currentProject.id}
            onOpenDataExport={() => {
              setStatsDialogOpen(false);
              setExportDialogOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={coreExpressionDialogOpen} onOpenChange={setCoreExpressionDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>编辑核心表达（JSON）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={coreExpressionDraft}
              onChange={(e) => setCoreExpressionDraft(e.target.value)}
              className="min-h-[320px] font-mono text-xs"
            />
            {coreExpressionDraftError ? (
              <div className="text-sm text-destructive">
                JSON 解析失败：{coreExpressionDraftError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCoreExpressionDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveCoreExpressionDraft}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={narrativeDialogOpen} onOpenChange={setNarrativeDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑叙事因果链（JSON）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              className="min-h-[420px] font-mono text-xs"
            />
            {narrativeDraftError ? (
              <div className="text-sm text-destructive">JSON 解析失败：{narrativeDraftError}</div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNarrativeDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveNarrativeDraft}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rerunPhaseDialogOpen}
        onOpenChange={(open) => {
          setRerunPhaseDialogOpen(open);
          if (!open) setPendingRerunPhase(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {(() => {
                if (!pendingRerunPhase) return '确认重新生成阶段？';
                const meta = CAUSAL_CHAIN_PHASES.find((p) => p.phase === pendingRerunPhase);
                return `确认重新生成：阶段 ${pendingRerunPhase} ${meta?.name ?? ''}`;
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              {(() => {
                if (!pendingRerunPhase) return '将重新调用 AI 生成该阶段产物。';
                const meta = CAUSAL_CHAIN_PHASES.find((p) => p.phase === pendingRerunPhase);
                return meta?.desc ?? '将重新调用 AI 生成该阶段产物。';
              })()}
            </div>
            <div className="text-destructive">
              {(() => {
                const narrative = currentProject?.contextCache?.narrativeCausalChain ?? null;
                const completed =
                  (narrative as { completedPhase?: number } | null)?.completedPhase ?? 0;
                const phase = pendingRerunPhase ?? 0;
                if (!phase) return '此操作会覆盖当前阶段内容，请确认。';
                if (phase === 1) {
                  return '阶段1会重建因果链骨架，并清空阶段2-4产物（信息分层/节拍流程/叙事线交织）。如只是微调，建议优先使用「编辑 JSON」。';
                }
                if (phase === 4) {
                  return '阶段4会覆盖现有叙事线与自洽校验结果。';
                }
                const next = Math.min(4, Math.max(phase, 1));
                return `将重新生成阶段${phase}并把进度标记回 ${next}/4（后续阶段可能需要重新运行以保持一致性）。当前进度：${completed}/4。`;
              })()}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRerunPhaseDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingRerunPhase || isRunningWorkflow || runningPhase !== null}
              onClick={() => {
                if (pendingRerunPhase) void handleCausalPhase(pendingRerunPhase, { force: true });
                setRerunPhaseDialogOpen(false);
                setPendingRerunPhase(null);
              }}
            >
              重新生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={refineDialogOpen}
        onOpenChange={(open) => {
          setRefineDialogOpen(open);
          if (!open) setSelectedSceneId(null);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>分镜详情（可编辑）</DialogTitle>
          </DialogHeader>
          {!refineScene ? (
            <div className="text-sm text-muted-foreground">未选择分镜。</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{refineScene.order}</Badge>
                    <Badge variant="outline">{getSceneStatusLabel(refineScene.status)}</Badge>
                  </div>
                  <p className="text-sm mt-2">{refineScene.summary}</p>
                </div>
                <Button
                  onClick={() => handleRefineSceneAll(refineScene.id)}
                  disabled={!aiProfileId || isRefining}
                  className="gap-2"
                >
                  {isRefining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>一键细化</span>
                </Button>
              </div>

              {isRefining && refiningSceneId === refineScene.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{refineJobProgress?.message || '正在细化...'}</span>
                    {typeof refineJobProgress?.pct === 'number' ? (
                      <span>{Math.round(refineJobProgress.pct)}%</span>
                    ) : null}
                  </div>
                  <Progress
                    value={typeof refineJobProgress?.pct === 'number' ? refineJobProgress.pct : 0}
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>场景锚点（Scene Anchor）</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopySceneAnchor('zh')}
                      disabled={!refineSceneAnchorCopyText.zh}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      <span>复制 ZH</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopySceneAnchor('en')}
                      disabled={!refineSceneAnchorCopyText.en}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      <span>复制 EN</span>
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={refineScene.sceneDescription}
                  onChange={(e) =>
                    currentEpisode?.id &&
                    updateScene(currentProject.id, currentEpisode.id, refineScene.id, {
                      sceneDescription: e.target.value,
                    })
                  }
                  className="min-h-[120px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>关键帧提示词（Shot Prompt）</Label>
                </div>
                {/* 关键帧快速复制区块 */}
                {parsedRefineKeyframes.isStructured && (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([0, 1, 2] as const).map((idx) => {
                        const kf = parsedRefineKeyframes.keyframes[idx];
                        const labels = ['KF0（起始）', 'KF1（中间）', 'KF2（结束）'];
                        const hasZh = Boolean(kf.zh);
                        const hasEn = Boolean(kf.en);
                        return (
                          <div key={idx} className="rounded-lg border bg-muted/30 p-2 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium">{labels[idx]}</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={!hasZh}
                                  onClick={() => void handleCopyKeyframe(idx, 'zh')}
                                >
                                  ZH
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={!hasEn}
                                  onClick={() => void handleCopyKeyframe(idx, 'en')}
                                >
                                  EN
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {hasZh || hasEn
                                ? (kf.zh || kf.en || '').slice(0, 60) + '...'
                                : '（未解析到）'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {parsedRefineKeyframes.avoid && (
                      <div className="rounded-lg border bg-muted/30 p-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium">AVOID（负面）</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={!parsedRefineKeyframes.avoid.zh}
                              onClick={() => void handleCopyKeyframeAvoid('zh')}
                            >
                              ZH
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={!parsedRefineKeyframes.avoid.en}
                              onClick={() => void handleCopyKeyframeAvoid('en')}
                            >
                              EN
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Textarea
                  value={refineScene.shotPrompt}
                  onChange={(e) =>
                    currentEpisode?.id &&
                    updateScene(currentProject.id, currentEpisode.id, refineScene.id, {
                      shotPrompt: e.target.value,
                    })
                  }
                  className="min-h-[160px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>时空/运动提示词（Motion Prompt）</Label>
                </div>
                {/* 运动提示词快速复制区块 */}
                {parsedRefineMotion.isStructured && (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(
                        [
                          { key: 'motionShort', label: 'SHORT（短版）' },
                          { key: 'motionBeats', label: 'BEATS（分拍）' },
                          { key: 'constraints', label: 'CONSTRAINTS' },
                        ] as const
                      ).map(({ key, label }) => {
                        const data = parsedRefineMotion[key];
                        const hasZh = Boolean(data.zh);
                        const hasEn = Boolean(data.en);
                        return (
                          <div key={key} className="rounded-lg border bg-muted/30 p-2 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium">{label}</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={!hasZh}
                                  onClick={() => void handleCopyMotion(key, 'zh')}
                                >
                                  ZH
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  disabled={!hasEn}
                                  onClick={() => void handleCopyMotion(key, 'en')}
                                >
                                  EN
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {hasZh || hasEn
                                ? (data.zh || data.en || '').slice(0, 60) + '...'
                                : '（未解析到）'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Textarea
                  value={refineScene.motionPrompt}
                  onChange={(e) =>
                    currentEpisode?.id &&
                    updateScene(currentProject.id, currentEpisode.id, refineScene.id, {
                      motionPrompt: e.target.value,
                    })
                  }
                  className="min-h-[160px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>台词（Dialogue）</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void handleCopyDialogues(
                        Array.isArray(refineScene.dialogues)
                          ? (refineScene.dialogues as DialogueLine[])
                          : [],
                      );
                    }}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    <span>复制 JSON</span>
                  </Button>
                </div>
                {Array.isArray(refineScene.dialogues) && refineScene.dialogues.length > 0 ? (
                  <div className="space-y-3">
                    {(refineScene.dialogues as DialogueLine[])
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((line) => {
                        // 不同台词类型的样式配置
                        const typeConfig: Record<
                          string,
                          { icon: React.ReactNode; bg: string; border: string; label: string }
                        > = {
                          dialogue: {
                            icon: <MessageSquare className="h-4 w-4" />,
                            bg: 'bg-blue-500/10',
                            border: 'border-blue-500/30',
                            label: '对白',
                          },
                          monologue: {
                            icon: <Quote className="h-4 w-4" />,
                            bg: 'bg-purple-500/10',
                            border: 'border-purple-500/30',
                            label: '独白',
                          },
                          narration: {
                            icon: <Mic className="h-4 w-4" />,
                            bg: 'bg-amber-500/10',
                            border: 'border-amber-500/30',
                            label: '旁白',
                          },
                          thought: {
                            icon: <Brain className="h-4 w-4" />,
                            bg: 'bg-emerald-500/10',
                            border: 'border-emerald-500/30',
                            label: '心理',
                          },
                        };
                        const config = typeConfig[line.type] || typeConfig.dialogue;

                        return (
                          <div
                            key={line.id}
                            className={`rounded-lg border ${config.border} ${config.bg} p-4`}
                          >
                            {/* 顶部：类型图标 + 角色名 + 情绪 */}
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                {config.icon}
                                <span className="text-xs font-medium uppercase tracking-wide">
                                  {config.label}
                                </span>
                              </div>
                              {line.characterName && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <div className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="font-semibold text-foreground">
                                      {line.characterName}
                                    </span>
                                  </div>
                                </>
                              )}
                              {line.emotion && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <Badge variant="outline" className="text-xs px-2 py-0">
                                    {line.emotion}
                                  </Badge>
                                </>
                              )}
                            </div>
                            {/* 台词内容 */}
                            <div className="pl-6">
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {line.type === 'narration' ? (
                                  <span className="italic text-muted-foreground">
                                    {line.content}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground">"</span>
                                    {line.content}
                                    <span className="text-muted-foreground">"</span>
                                  </>
                                )}
                              </p>
                            </div>
                            {/* 备注（如有） */}
                            {line.notes && (
                              <div className="mt-2 pl-6 text-xs text-muted-foreground border-l-2 border-muted ml-1">
                                <span className="ml-2">导演备注：{line.notes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <Mic className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">暂无台词</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      点击「一键细化」可自动生成台词
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>备注（Notes）</Label>
                <Textarea
                  value={refineScene.notes}
                  onChange={(e) =>
                    currentEpisode?.id &&
                    updateScene(currentProject.id, currentEpisode.id, refineScene.id, {
                      notes: e.target.value,
                    })
                  }
                  className="min-h-[80px]"
                />
              </div>

              <Separator />
              <div className="flex items-center justify-between">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!currentEpisode?.id) return;
                    void (async () => {
                      await deleteScene(currentProject.id, currentEpisode.id, refineScene.id);
                      setRefineDialogOpen(false);
                    })();
                  }}
                >
                  删除分镜
                </Button>
                <Button variant="outline" onClick={() => setRefineDialogOpen(false)}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>导出预览</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {isExporting ? '生成中...' : exportContent ? '已生成' : '点击生成以获取最新数据'}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBuildExport}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>生成</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleCopyExport}
                disabled={!exportContent}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                <span>{copied ? '已复制' : '复制'}</span>
              </Button>
              <Button onClick={handleDownloadExport} disabled={!exportContent} className="gap-2">
                <Download className="h-4 w-4" />
                <span>下载</span>
              </Button>
            </div>
          </div>
          <Separator className="my-3" />
          <Textarea value={exportContent} readOnly className="min-h-[420px] font-mono text-xs" />
        </DialogContent>
      </Dialog>

      <Dialog open={sortDialogOpen} onOpenChange={setSortDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>拖拽排序</DialogTitle>
          </DialogHeader>
          <SceneSortable
            scenes={scenes.slice().sort((a, b) => a.order - b.order)}
            onReorder={(next) => {
              if (!currentEpisode?.id) return;
              const reordered = next.map((s, idx) => ({ ...s, order: idx + 1 }));
              setScenes(reordered);
              const ids = reordered.map((s) => s.id);
              void apiReorderEpisodeScenes(currentProject.id, currentEpisode.id, ids)
                .then((serverScenes) => {
                  setScenes(serverScenes as Scene[]);
                  setSortDialogOpen(false);
                })
                .catch((error) =>
                  toast({
                    title: '保存排序失败',
                    description: error instanceof Error ? error.message : String(error),
                    variant: 'destructive',
                  }),
                );
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editEpisodeDialogOpen} onOpenChange={setEditEpisodeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑 Episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={episodeTitleDraft}
                onChange={(e) => setEpisodeTitleDraft(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>一句话概要</Label>
              <Textarea
                value={episodeSummaryDraft}
                onChange={(e) => setEpisodeSummaryDraft(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditEpisodeDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEpisodeEdits} disabled={!editingEpisodeId}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentProject?.id ? (
        <NarrativeCausalChainVersionDialog
          open={versionDialogOpen}
          onOpenChange={setVersionDialogOpen}
          projectId={currentProject.id}
          narrative={currentProject.contextCache?.narrativeCausalChain ?? null}
          narrativeUpdatedAt={currentProject.contextCache?.narrativeCausalChainUpdatedAt ?? null}
        />
      ) : null}

      <Dialog
        open={createEpisodeDialogOpen}
        onOpenChange={(open) => {
          setCreateEpisodeDialogOpen(open);
          if (!open) {
            setNewEpisodeTitleDraft('');
            setNewEpisodeSummaryDraft('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增 Episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              将创建：第 <span className="font-medium text-foreground">{nextEpisodeOrder}</span> 集
            </div>
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={newEpisodeTitleDraft}
                onChange={(e) => setNewEpisodeTitleDraft(e.target.value)}
                placeholder="可留空，后续可编辑"
              />
            </div>
            <div className="space-y-2">
              <Label>一句话概要</Label>
              <Textarea
                value={newEpisodeSummaryDraft}
                onChange={(e) => setNewEpisodeSummaryDraft(e.target.value)}
                placeholder="可留空，后续可编辑"
                className="min-h-[120px]"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              提示：新增/删除会直接影响后续「单集创作」的可选 Episode 列表。
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateEpisodeDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateEpisodeManual} disabled={!currentProject?.id}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteEpisodeDialogOpen}
        onOpenChange={(open) => {
          setDeleteEpisodeDialogOpen(open);
          if (!open) setPendingDeleteEpisode(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>确认删除 Episode？</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">
              {pendingDeleteEpisode
                ? `将删除第 ${pendingDeleteEpisode.order} 集：${pendingDeleteEpisode.title || '(未命名)'}`
                : '将删除所选 Episode。'}
            </div>
            <div className="text-destructive">
              删除后该集下的分镜/相关数据会一并移除（不可恢复）。同时将自动重排后续集数，保持 order
              连续。
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteEpisodeDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingDeleteEpisode || isRunningWorkflow}
              onClick={handleDeleteEpisodeConfirmed}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
