import { useMemo, useState } from 'react';
import type { ArtifactStatus, Character, Episode, Project, Scene, WorldViewElement } from '@/types';
import {
  buildEpisodeIssues,
  buildContinuityReport,
  buildProjectIssues,
  buildWorkbenchTasks,
  computeEpisodeMetrics,
  getEpisodeWorkflowV2,
  getProjectWorkflowV2,
  type ContinuityReport,
  type WorkflowIssue,
} from '@/lib/workflowV2';
import { apiListEpisodeScenes } from '@/lib/api/episodeScenes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  Circle,
  Lock,
  AlertTriangle,
  Info,
  RefreshCw,
  Loader2,
  FileText,
  Clock,
  LayoutGrid,
  Type,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  BookOpen,
  Clapperboard,
  Image as ImageIcon,
  Check,
  XCircle,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StepId = 'workbench' | 'global' | 'causal' | 'plan' | 'episode' | 'export';

// --- Utility Components ---

function StatusBadge({ status, onClick }: { status: ArtifactStatus; onClick?: () => void }) {
  const styles = {
    draft: 'bg-muted text-muted-foreground hover:bg-muted/80',
    review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50',
    locked: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50',
  };

  const labels = {
    draft: '草稿',
    review: '评审',
    locked: '锁定',
  };

  return (
    <Badge
      variant="outline"
      className={cn("cursor-pointer transition-colors border-transparent", styles[status])}
      onClick={onClick}
    >
      {status === 'locked' && <Lock className="w-3 h-3 mr-1" />}
      {labels[status]}
    </Badge>
  );
}

function MetricCard({ label, value, icon, subValue }: { label: string; value: string | number; icon: React.ReactNode; subValue?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="flex items-baseline gap-2">
            <h4 className="text-2xl font-bold">{value}</h4>
            {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
          </div>
        </div>
        <div className="p-2 bg-primary/5 rounded-lg text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowStageItem({
  label,
  status,
  icon,
  onSetStatus,
  isLast = false
}: {
  label: string;
  status: ArtifactStatus;
  icon: React.ReactNode;
  onSetStatus: (s: ArtifactStatus) => void;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 group">
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
          status === 'locked' ? "bg-emerald-500 text-white border-emerald-500" :
          status === 'review' ? "bg-amber-100 text-amber-600 border-amber-200" :
          "bg-muted text-muted-foreground border-border"
        )}>
          {status === 'locked' ? <Check className="w-4 h-4" /> : icon}
        </div>
        {!isLast && <div className={cn("w-0.5 h-12 my-1", status === 'locked' ? "bg-emerald-200" : "bg-border")} />}
      </div>
      <div className="flex-1 pt-1 pb-6">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-medium">{label}</h4>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSetStatus('draft')} title="设为草稿"><Circle className="w-3 h-3" /></Button>
             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSetStatus('review')} title="设为评审"><AlertCircle className="w-3 h-3" /></Button>
             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSetStatus('locked')} title="设为锁定"><Lock className="w-3 h-3" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <StatusBadge status={status} />
           <span className="text-xs text-muted-foreground">
             {status === 'draft' ? '内容正在撰写中...' :
              status === 'review' ? '等待确认核心要素...' :
              '已定稿，下游可依赖'}
           </span>
        </div>
      </div>
    </div>
  );
}

function IssueItem({ issue, onAction }: { issue: WorkflowIssue; onAction?: () => void }) {
  const styles = {
    error: 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
    warn: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
    info: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10',
  };

  return (
    <div className={cn("flex items-start gap-3 p-3 text-sm border rounded-r-md border-l-4", styles[issue.level])}>
      <div className="mt-0.5">
        {issue.level === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
        {issue.level === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
        {issue.level === 'info' && <Info className="w-4 h-4 text-blue-500" />}
      </div>
      <div className="flex-1 space-y-1">
        <div className="font-medium text-foreground">{issue.title}</div>
        {issue.detail && <p className="text-muted-foreground text-xs">{issue.detail}</p>}
      </div>
      {onAction && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAction}>
          处理 <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// --- Main Component ---

export function WorkflowWorkbench(props: {
  project: Project | null;
  styleFullPrompt: string;
  characters: Character[];
  worldViewElements: WorldViewElement[];
  episodes: Episode[];
  currentEpisode: Episode | null;
  currentEpisodeScenes: Scene[];
  aiProfileId: string | null;
  onGoToStep: (step: StepId) => void;
  onGoToScene?: (episodeId: string, sceneId: string) => void;
  onRunPlanEpisodes: () => void;
  onRunGenerateCoreExpression: () => void;
  onRunGenerateSceneList: () => void;
  onRunBatchRefineAll: () => void;
  onSetProjectArtifactStatus: (artifact: 'bible' | 'seasonArc', status: ArtifactStatus) => void;
  onSetEpisodeArtifactStatus: (
    artifact: 'outline' | 'storyboard' | 'promptPack',
    status: ArtifactStatus,
  ) => void;
}) {
  const {
    project,
    styleFullPrompt,
    characters,
    worldViewElements,
    episodes,
    currentEpisode,
    currentEpisodeScenes,
    aiProfileId,
  } = props;

  const projectV2 = useMemo(() => getProjectWorkflowV2(project), [project]);
  const episodeV2 = useMemo(() => getEpisodeWorkflowV2(currentEpisode), [currentEpisode]);
  const hasNarrativeCausalChain = Boolean(project?.contextCache?.narrativeCausalChain);

  const projectIssues = useMemo(
    () =>
      buildProjectIssues({
        project,
        styleFullPrompt,
        characters,
        worldViewElements,
        episodes,
      }),
    [project, styleFullPrompt, characters, worldViewElements, episodes],
  );

  const episodeIssues = useMemo(() => {
    if (!project) return [];
    return buildEpisodeIssues({
      project,
      episode: currentEpisode,
      scenes: currentEpisodeScenes,
      characters,
    });
  }, [project, currentEpisode, currentEpisodeScenes, characters]);

  const episodeMetrics = useMemo(
    () => computeEpisodeMetrics(currentEpisodeScenes),
    [currentEpisodeScenes],
  );

  const tasks = useMemo(
    () =>
      buildWorkbenchTasks({
        aiProfileId,
        project,
        styleFullPrompt,
        hasNarrativeCausalChain,
        characters,
        worldViewElements,
        episodes,
        currentEpisode,
        currentEpisodeScenes,
      }),
    [
      aiProfileId,
      project,
      styleFullPrompt,
      hasNarrativeCausalChain,
      characters,
      worldViewElements,
      episodes,
      currentEpisode,
      currentEpisodeScenes,
    ],
  );

  const issues = useMemo(
    () => [...projectIssues, ...episodeIssues],
    [projectIssues, episodeIssues],
  );

  const episodeMinutes = episodeMetrics.totalEstimatedSeconds / 60;
  const canRunAI = Boolean(aiProfileId);

  const [continuityReport, setContinuityReport] = useState<ContinuityReport | null>(null);
  const [, setContinuityError] = useState<string | null>(null);
  const [isContinuityLoading, setIsContinuityLoading] = useState(false);

  const handleBuildContinuityReport = async () => {
    if (!project) return;
    setIsContinuityLoading(true);
    setContinuityError(null);
    try {
      const pairs = await Promise.all(
        episodes.map(async (ep) => {
          try {
            const epScenes = await apiListEpisodeScenes(project.id, ep.id);
            return [ep.id, epScenes as Scene[]] as const;
          } catch {
            return [ep.id, [] as Scene[]] as const;
          }
        }),
      );
      const map = new Map<string, Scene[]>();
      pairs.forEach(([id, scenes]) => map.set(id, scenes));
      setContinuityReport(
        buildContinuityReport({
          projectId: project.id,
          episodes,
          scenesByEpisode: map,
          characters,
          worldViewElements,
        }),
      );
    } catch (error) {
      setContinuityError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsContinuityLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">工作台</h2>
          <p className="text-muted-foreground mt-1">
            项目 {project?.title ? `"${project.title}"` : ''} 的全景视图与质量控制中心
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-xs font-medium text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-full", canRunAI ? "bg-green-500" : "bg-amber-500")} />
            {canRunAI ? 'AI 就绪' : 'AI 未配置'}
          </div>
          <Button variant="outline" onClick={() => props.onGoToStep('export')}>
            <FileText className="w-4 h-4 mr-2" />
            导出产物
          </Button>
        </div>
      </div>

      {/* Top Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="分镜总数"
          value={episodeMetrics.panelCount}
          subValue="Panels"
          icon={<LayoutGrid className="w-5 h-5" />}
        />
        <MetricCard
          label="估算时长"
          value={Number.isFinite(episodeMinutes) ? `${episodeMinutes.toFixed(1)}m` : '-'}
          subValue="Duration"
          icon={<Timer className="w-5 h-5" />}
        />
        <MetricCard
          label="平均节奏"
          value={`${episodeMetrics.avgSecondsPerPanel}s`}
          subValue="/ Panel"
          icon={<Clock className="w-5 h-5" />}
        />
        <MetricCard
          label="对白字数"
          value={episodeMetrics.totalDialogueChars}
          subValue="Chars"
          icon={<Type className="w-5 h-5" />}
        />
            </div>

      {/* Main Content Layout */}
      <div className="grid gap-6 lg:grid-cols-12">
        
        {/* Left Column: Workflow Status (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="h-full border-l-4 border-l-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">产物流水线</CardTitle>
              <CardDescription>管理各阶段产物的状态与版本</CardDescription>
            </CardHeader>
            <CardContent className="pl-6">
              <div className="relative">
                {/* Project Level */}
                <div className="mb-6">
                  <h5 className="text-xs font-bold text-muted-foreground uppercase mb-4 tracking-wider">Project Level</h5>
                  <WorkflowStageItem
                    label="项目圣经 (Bible)"
                    status={projectV2.artifacts.bible.status}
                    icon={<BookOpen className="w-4 h-4" />}
                    onSetStatus={(s) => props.onSetProjectArtifactStatus('bible', s)}
                  />
          </div>
                
                {/* Episode Level */}
            <div>
                  <h5 className="text-xs font-bold text-muted-foreground uppercase mb-4 tracking-wider">Episode Level</h5>
                  <WorkflowStageItem
                    label="本集大纲 (Outline)"
                    status={episodeV2.artifacts.outline.status}
                    icon={<FileText className="w-4 h-4" />}
                    onSetStatus={(s) => props.onSetEpisodeArtifactStatus('outline', s)}
                  />
                  <WorkflowStageItem
                    label="分镜脚本 (Storyboard)"
                    status={episodeV2.artifacts.storyboard.status}
                    icon={<Clapperboard className="w-4 h-4" />}
                    onSetStatus={(s) => props.onSetEpisodeArtifactStatus('storyboard', s)}
                  />
                  <WorkflowStageItem
                    label="提示词包 (Prompts)"
                    status={episodeV2.artifacts.promptPack.status}
                    icon={<ImageIcon className="w-4 h-4" />}
                    onSetStatus={(s) => props.onSetEpisodeArtifactStatus('promptPack', s)}
                    isLast
                  />
            </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Actions & Issues (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Active Tasks */}
          <Card>
            <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
                <CardTitle className="text-lg">待办任务</CardTitle>
                <Badge variant="secondary" className="rounded-full">{tasks.filter(t => t.status !== 'done').length} Pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
            {tasks.map((t) => {
                  const isDone = t.status === 'done';
              const action =
                t.id === 'task:planEpisodes'
                      ? { label: '执行规划', onClick: props.onRunPlanEpisodes }
                  : t.id === 'task:causalChain'
                        ? { label: '编辑因果链', onClick: () => props.onGoToStep('causal') }
                    : t.id === 'task:episode:coreExpression'
                          ? { label: '生成核心表达', onClick: props.onRunGenerateCoreExpression }
                      : t.id === 'task:episode:sceneList'
                            ? { label: '生成分镜表', onClick: props.onRunGenerateSceneList }
                        : t.id === 'task:episode:shotPrompt' || t.id === 'task:episode:dialogue'
                              ? { label: '一键细化', onClick: props.onRunBatchRefineAll }
                          : t.id === 'task:bible'
                                ? { label: '编辑圣经', onClick: () => props.onGoToStep('global') }
                            : t.id === 'task:worldView'
                                  ? { label: '编辑世界观', onClick: () => props.onGoToStep('global') }
                              : null;

              return (
                <div
                  key={t.id}
                      className={cn(
                        "flex flex-col justify-between p-4 rounded-lg border transition-all hover:shadow-sm",
                        isDone ? "bg-muted/30 opacity-60" : "bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                          <Badge variant={isDone ? 'outline' : 'default'} className="text-[10px] h-5">
                            {t.level === 'error' ? '必做' : t.level === 'warn' ? '推荐' : '可选'}
                        </Badge>
                          {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                        <h4 className="font-semibold text-sm">{t.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2" title={t.description}>
                          {t.description}
                        </p>
                      </div>
                      {action && !isDone && (
                        <Button size="sm" className="w-full text-xs" onClick={action.onClick} disabled={t.status === 'blocked'}>
                          {action.label} <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                </div>
              );
            })}
          </div>
            </CardContent>
        </Card>

          {/* Quality Issues */}
          <Card>
            <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
                <CardTitle className="text-lg">质量检查</CardTitle>
                {issues.length > 0 ? (
                   <span className="text-sm text-destructive font-medium flex items-center gap-1">
                     <AlertCircle className="w-4 h-4" />
                     {issues.length} 个问题需要关注
                   </span>
                ) : (
                   <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                     <CheckCircle2 className="w-4 h-4" />
                     状态良好
                   </span>
                )}
          </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mb-2 opacity-20" />
                      <p>未发现明显问题</p>
        </div>
                  ) : (
                    issues.map((i) => (
                      <IssueItem
                        key={i.id}
                        issue={i}
                        onAction={() => {
                          if (i.scope.sceneId && props.onGoToScene && i.scope.episodeId) {
                            props.onGoToScene(i.scope.episodeId, i.scope.sceneId);
                          } else if (i.scope.episodeId) {
                            props.onGoToStep('episode');
                          } else if (i.scope.projectId) {
                            props.onGoToStep('global');
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Continuity Report (Collapsible/Detailed) */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">一致性报告</CardTitle>
                  <CardDescription className="mt-1">
                    检查跨集角色、道具、场景的一致性
                  </CardDescription>
                </div>
            <Button
                  variant="secondary"
              size="sm"
              onClick={() => void handleBuildContinuityReport()}
              disabled={!project || episodes.length === 0 || isContinuityLoading}
                >
                  {isContinuityLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  生成报告
            </Button>
              </div>
            </CardHeader>
            {continuityReport && (
              <CardContent className="space-y-6">
                {/* Report Stats */}
                <div className="flex gap-4 p-4 bg-muted/30 rounded-lg">
                   <div className="text-center px-4 border-r">
                      <div className="text-2xl font-bold">{continuityReport.episodeCount}</div>
                      <div className="text-xs text-muted-foreground uppercase">Episodes</div>
              </div>
                   <div className="text-center px-4 border-r">
                      <div className="text-2xl font-bold">{continuityReport.issueCounts.error}</div>
                      <div className="text-xs text-destructive font-bold uppercase">Errors</div>
            </div>
                   <div className="text-center px-4">
                      <div className="text-2xl font-bold text-amber-600">{continuityReport.issueCounts.warn}</div>
                      <div className="text-xs text-amber-600 font-bold uppercase">Warnings</div>
                  </div>
            </div>

                {/* Report Details List */}
                <div className="space-y-4">
                   {continuityReport.issues.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">完美！未发现一致性问题。</p>
                   ) : (
                      <div className="space-y-2">
                         {continuityReport.issues.slice(0, 5).map(i => (
                            <IssueItem 
                              key={i.id} 
                              issue={i} 
                              onAction={() => {
                                if (i.scope.sceneId && props.onGoToScene && i.scope.episodeId) {
                                  props.onGoToScene(i.scope.episodeId, i.scope.sceneId);
                                }
                              }}
                            />
                         ))}
                         {continuityReport.issues.length > 5 && (
                            <p className="text-center text-xs text-muted-foreground pt-2">
                               还有 {continuityReport.issues.length - 5} 个问题...
                            </p>
                         )}
                  </div>
                )}
                </div>
              </CardContent>
            )}
          </Card>

            </div>
          </div>
    </div>
  );
}
