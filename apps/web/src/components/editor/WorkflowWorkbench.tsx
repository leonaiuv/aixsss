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
  type WorkflowIssueLevel,
} from '@/lib/workflowV2';
import { apiListEpisodeScenes } from '@/lib/api/episodeScenes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Circle, Lock, AlertTriangle, Info, RefreshCw, Loader2 } from 'lucide-react';

type StepId = 'workbench' | 'global' | 'causal' | 'plan' | 'episode' | 'export';

function statusLabel(status: ArtifactStatus): string {
  if (status === 'draft') return '草稿';
  if (status === 'review') return '评审';
  return '锁定';
}

function statusBadgeVariant(status: ArtifactStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'locked') return 'default';
  if (status === 'review') return 'secondary';
  return 'outline';
}

function issueIcon(level: WorkflowIssueLevel) {
  if (level === 'error') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (level === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function issueLevelLabel(level: WorkflowIssueLevel): string {
  if (level === 'error') return '阻塞';
  if (level === 'warn') return '注意';
  return '建议';
}

function issueLevelBadgeVariant(level: WorkflowIssueLevel): 'default' | 'secondary' | 'outline' {
  if (level === 'error') return 'default';
  if (level === 'warn') return 'secondary';
  return 'outline';
}

function groupIssues(issues: WorkflowIssue[]) {
  const grouped: Record<WorkflowIssueLevel, WorkflowIssue[]> = { error: [], warn: [], info: [] };
  issues.forEach((i) => grouped[i.level].push(i));
  return grouped;
}

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
  const grouped = useMemo(() => groupIssues(issues), [issues]);

  const episodeMinutes = episodeMetrics.totalEstimatedSeconds / 60;
  const canRunAI = Boolean(aiProfileId);

  const [continuityReport, setContinuityReport] = useState<ContinuityReport | null>(null);
  const [continuityError, setContinuityError] = useState<string | null>(null);
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">工作台</h2>
          <p className="text-sm text-muted-foreground">
            面向多集静态漫画分镜的产物/任务/校验视图（提示词与剧本输出为主）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={canRunAI ? 'secondary' : 'outline'}>
            {canRunAI ? 'AI 可用' : 'AI 未配置'}
          </Badge>
          <Button variant="outline" onClick={() => props.onGoToStep('export')}>
            去导出
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">本集节奏估算（粗略）</div>
            <div className="text-xs text-muted-foreground">
              基于对白字数/气泡数量估算每格展示时间，用于图生视频节奏参考（非配音口播）。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">分镜格数</div>
              <div className="font-semibold">{episodeMetrics.panelCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">估算时长</div>
              <div className="font-semibold">
                {Number.isFinite(episodeMinutes) ? `${episodeMinutes.toFixed(1)} 分钟` : '-'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">平均/格</div>
              <div className="font-semibold">{episodeMetrics.avgSecondsPerPanel}s</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">对白字数</div>
              <div className="font-semibold">{episodeMetrics.totalDialogueChars}</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">产物状态</div>
            <Button variant="ghost" size="sm" onClick={() => props.onGoToStep('global')}>
              去编辑
            </Button>
          </div>
          <Separator />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">项目圣经</div>
                <Badge variant={statusBadgeVariant(projectV2.artifacts.bible.status)}>
                  {statusLabel(projectV2.artifacts.bible.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetProjectArtifactStatus('bible', 'draft')}
                >
                  草稿
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetProjectArtifactStatus('bible', 'review')}
                >
                  评审
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => props.onSetProjectArtifactStatus('bible', 'locked')}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  锁定
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">本集 Outline</div>
                <Badge variant={statusBadgeVariant(episodeV2.artifacts.outline.status)}>
                  {statusLabel(episodeV2.artifacts.outline.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('outline', 'draft')}
                >
                  草稿
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('outline', 'review')}
                >
                  评审
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => props.onSetEpisodeArtifactStatus('outline', 'locked')}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  锁定
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">分镜脚本（Panel）</div>
                <Badge variant={statusBadgeVariant(episodeV2.artifacts.storyboard.status)}>
                  {statusLabel(episodeV2.artifacts.storyboard.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('storyboard', 'draft')}
                >
                  草稿
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('storyboard', 'review')}
                >
                  评审
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => props.onSetEpisodeArtifactStatus('storyboard', 'locked')}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  锁定
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">提示词包（Prompt Pack）</div>
                <Badge variant={statusBadgeVariant(episodeV2.artifacts.promptPack.status)}>
                  {statusLabel(episodeV2.artifacts.promptPack.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('promptPack', 'draft')}
                >
                  草稿
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onSetEpisodeArtifactStatus('promptPack', 'review')}
                >
                  评审
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => props.onSetEpisodeArtifactStatus('promptPack', 'locked')}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  锁定
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">任务清单</div>
            <Button variant="ghost" size="sm" onClick={() => props.onGoToStep('plan')}>
              去规划
            </Button>
          </div>
          <Separator />

          <div className="space-y-2">
            {tasks.map((t) => {
              const icon =
                t.status === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : t.status === 'blocked' ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                );

              const action =
                t.id === 'task:planEpisodes'
                  ? { label: '执行', onClick: props.onRunPlanEpisodes }
                  : t.id === 'task:causalChain'
                    ? { label: '前往', onClick: () => props.onGoToStep('causal') }
                    : t.id === 'task:episode:coreExpression'
                      ? { label: '执行', onClick: props.onRunGenerateCoreExpression }
                      : t.id === 'task:episode:sceneList'
                        ? { label: '执行', onClick: props.onRunGenerateSceneList }
                        : t.id === 'task:episode:shotPrompt' || t.id === 'task:episode:dialogue'
                          ? { label: '批量细化', onClick: props.onRunBatchRefineAll }
                          : t.id === 'task:bible'
                            ? { label: '前往', onClick: () => props.onGoToStep('global') }
                            : t.id === 'task:worldView'
                              ? { label: '前往', onClick: () => props.onGoToStep('global') }
                              : null;

              return (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{icon}</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">{t.title}</div>
                        <Badge variant={issueLevelBadgeVariant(t.level)} className="h-5">
                          {issueLevelLabel(t.level)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {action && (
                      <Button
                        size="sm"
                        variant={t.status === 'done' ? 'outline' : 'default'}
                        onClick={action.onClick}
                        disabled={t.status === 'blocked' || t.status === 'done'}
                      >
                        {action.label}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">质量检查</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>阻塞 {grouped.error.length}</span>
            <span>注意 {grouped.warn.length}</span>
            <span>建议 {grouped.info.length}</span>
          </div>
        </div>
        <Separator />

        {issues.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无问题。</div>
        ) : (
          <div className="space-y-2">
            {issues.map((i) => (
              <div key={i.id} className="flex items-start gap-3 rounded-md border p-3">
                <div className="mt-0.5">{issueIcon(i.level)}</div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={issueLevelBadgeVariant(i.level)} className="h-5">
                      {issueLevelLabel(i.level)}
                    </Badge>
                    <div className="text-sm font-medium">{i.title}</div>
                  </div>
                  {i.detail && <div className="text-xs text-muted-foreground">{i.detail}</div>}
                </div>
                <div className="shrink-0">
                  {i.scope.sceneId ? (
                    <Button size="sm" variant="outline" onClick={() => props.onGoToStep('episode')}>
                      查看
                    </Button>
                  ) : i.scope.episodeId ? (
                    <Button size="sm" variant="outline" onClick={() => props.onGoToStep('episode')}>
                      前往
                    </Button>
                  ) : i.scope.projectId ? (
                    <Button size="sm" variant="outline" onClick={() => props.onGoToStep('global')}>
                      前往
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-medium">跨集连续性报告</div>
            <div className="text-xs text-muted-foreground">
              手动拉取所有剧集分镜，检查地点绑定/角色出场/命名一致性（避免测试环境自动请求）。
            </div>
          </div>
          <div className="flex items-center gap-2">
            {continuityReport ? (
              <div className="text-xs text-muted-foreground">
                生成于 {new Date(continuityReport.generatedAt).toLocaleString('zh-CN')}
              </div>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleBuildContinuityReport()}
              disabled={!project || episodes.length === 0 || isContinuityLoading}
              className="gap-2"
            >
              {isContinuityLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>{continuityReport ? '重新生成' : '生成报告'}</span>
            </Button>
          </div>
        </div>
        <Separator />

        {episodes.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无 Episode，无需生成报告。</div>
        ) : continuityError ? (
          <div className="text-sm text-destructive">{continuityError}</div>
        ) : !continuityReport ? (
          <div className="text-sm text-muted-foreground">
            点击“生成报告”，将检查每格分镜的地点绑定与角色出场，输出跨集一致性问题清单。
          </div>
        ) : continuityReport.issues.length === 0 ? (
          <div className="text-sm text-muted-foreground">未发现跨集连续性问题。</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span>集数 {continuityReport.episodeCount}</span>
                <span>格数 {continuityReport.panelCount}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span>阻塞 {continuityReport.issueCounts.error}</span>
                <span>注意 {continuityReport.issueCounts.warn}</span>
                <span>建议 {continuityReport.issueCounts.info}</span>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {continuityReport.byEpisode.map((ep) => (
                <div key={ep.episodeId} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">
                      第 {ep.order} 集{ep.title ? `：${ep.title}` : ''}
                    </div>
                    <Badge variant="outline" className="h-5">
                      {ep.panelCount} 格
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>缺地点：{ep.missingLocationCount}</div>
                    <div>坏地点引用：{ep.unknownLocationRefCount}</div>
                    <div>未勾选出场：{ep.missingCharactersPresentCount}</div>
                    <div>未知角色/命名：{ep.unknownCharacterIdCount + ep.unknownDialogueCharacterNameCount}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {continuityReport.issues.map((i) => (
                <div key={i.id} className="flex items-start gap-3 rounded-md border p-3">
                  <div className="mt-0.5">{issueIcon(i.level)}</div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={issueLevelBadgeVariant(i.level)} className="h-5">
                        {issueLevelLabel(i.level)}
                      </Badge>
                      <div className="text-sm font-medium">{i.title}</div>
                    </div>
                    {i.detail && <div className="text-xs text-muted-foreground">{i.detail}</div>}
                  </div>
                  <div className="shrink-0">
                    {i.scope.sceneId || i.scope.episodeId ? (
                      <Button size="sm" variant="outline" onClick={() => props.onGoToStep('episode')}>
                        前往
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
