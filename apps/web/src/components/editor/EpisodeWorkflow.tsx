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
import {
  migrateOldStyleToConfig,
  DIALOGUE_TYPE_LABELS,
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
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
  RefreshCw,
  FileText,
  Copy,
  Download,
  Terminal,
  BarChart3,
} from 'lucide-react';

type WorkflowStep = 'global' | 'plan' | 'episode' | 'export';

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

export function EpisodeWorkflow() {
  const { toast } = useToast();
  const currentProject = useProjectStore((s) => s.currentProject);
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
    updateEpisode,
    planEpisodes,
    generateCoreExpression,
    generateSceneList,
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

  if (!currentProject) return null;

  const workflowLabel = getWorkflowStateLabel(currentProject.workflowState);
  const projectCharacters = characters.filter((c) => c.projectId === currentProject.id);

  const steps: Array<{ id: WorkflowStep; name: string }> = [
    { id: 'global', name: '全局设定' },
    { id: 'plan', name: '剧集规划' },
    { id: 'episode', name: '单集创作' },
    { id: 'export', name: '整合导出' },
  ];

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
    const filename = `episode-export-${currentProject.id}-${Date.now()}.${exportFormat === 'json' ? 'json' : 'md'}`;
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
    const order: WorkflowStep[] = ['global', 'plan', 'episode', 'export'];
    return order.indexOf(step) < order.indexOf(activeStep) ? 'completed' : 'pending';
  };

  const renderPlanStep = () => {
    const summaryLen = (currentProject.summary ?? '').trim().length;
    const hasStyle = Boolean(styleFullPrompt.trim());
    const missing: string[] = [];
    if (summaryLen < 100) missing.push('故事梗概 ≥ 100 字');
    if (!hasStyle) missing.push('画风（Full Prompt）');
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
                disabled={!canPlan || isRunningWorkflow}
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
                onClick={() => currentProject.id && loadEpisodes(currentProject.id)}
                disabled={!currentProject.id || isEpisodesLoading}
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
            <div className="text-sm text-muted-foreground">
              {isEpisodesLoading ? '加载中...' : `${episodes.length} 集`}
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
                  <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-4 overflow-auto">
                    {safeJsonStringify(currentEpisode.coreExpression)}
                  </pre>
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
                        placeholder="留空默认 10（限制 8..12）"
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
                        currentEpisode?.id && loadScenes(currentProject.id, currentEpisode.id)
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
                                  <Badge variant="outline">{scene.status}</Badge>
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
                                <Badge variant="outline">{scene.status}</Badge>
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
              proceedText="确认并进入剧集规划"
              onProceed={() => setActiveStep('plan')}
            />
          )}
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
                <Label>场景锚点（Scene Anchor）</Label>
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
                <Label>关键帧提示词（Shot Prompt）</Label>
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
                <Label>时空/运动提示词（Motion Prompt）</Label>
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
                  <Label>台词</Label>
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
                  <div className="space-y-2">
                    {(refineScene.dialogues as DialogueLine[])
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((line) => (
                        <Card key={line.id} className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary">#{line.order}</Badge>
                            <Badge variant="outline">
                              {DIALOGUE_TYPE_LABELS[line.type] ?? line.type}
                            </Badge>
                            {line.characterName ? (
                              <Badge variant="outline">{line.characterName}</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm mt-2 whitespace-pre-wrap">{line.content}</p>
                        </Card>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">（无台词）</div>
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
    </div>
  );
}
