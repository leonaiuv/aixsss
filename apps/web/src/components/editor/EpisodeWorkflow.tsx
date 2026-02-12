import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { useEpisodeScenesStore } from '@/stores/episodeScenesStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { useCharacterRelationshipStore } from '@/stores/characterRelationshipStore';
import { useEmotionArcStore } from '@/stores/emotionArcStore';
import {
  apiListEpisodeScenes,
  apiReorderEpisodeScenes,
  apiUpdateEpisodeScene,
} from '@/lib/api/episodeScenes';
import { apiCancelAIJob, apiWaitForAIJob } from '@/lib/api/aiJobs';
import {
  apiWorkflowGenerateKeyframeImages,
  apiWorkflowGenerateKeyframePrompt,
  apiWorkflowGenerateSceneVideo,
  apiWorkflowRefineAllScenes,
  apiWorkflowRefineSceneAll,
  apiWorkflowGenerateSceneScript,
  apiWorkflowExpandStoryCharacters,
  apiWorkflowRunSupervisor,
  apiWorkflowRunEpisodeCreationAgent,
  apiWorkflowGenerateSoundDesign,
  apiWorkflowEstimateDuration,
} from '@/lib/api/workflow';
import { flushApiEpisodeScenePatchQueue } from '@/lib/api/episodeScenePatchQueue';
import { getWorkflowStateLabel } from '@/lib/workflowLabels';
import { isApiMode } from '@/lib/runtime/mode';
import { apiListNarrativeCausalChainVersions } from '@/lib/api/narrativeCausalChainVersions';
import {
  buildEpisodeArtifactPatch,
  buildProjectArtifactPatch,
  buildImg2ImgPackCopyText,
  buildFinalPromptPack,
  buildPromptLayers,
  computeEpisodeMetrics,
  computePanelMetrics,
  resolvePanelAssetManifest,
  resolvePanelScript,
  buildSceneAnchorCopyText,
  buildKeyframeCopyText,
  buildMotionCopyText,
  mergeSingleKeyframePrompt,
  isGeneratedImageKeyframe,
  mergeGeneratedImages,
} from '@/lib/workflowV2';
import {
  migrateOldStyleToConfig,
  type ArtifactStatus,
  type DialogueLine,
  type EmotionArcPoint,
  type Episode,
  type Project,
  type Scene,
  type SceneScriptBlock,
} from '@/types';
import { GENERATED_IMAGE_KEYFRAMES, type GeneratedImageKeyframe } from '@aixsss/shared';
import { useToast } from '@/hooks/use-toast';
import {
  logAICall,
  updateLogProgress,
  updateLogWithCancelled,
  updateLogWithError,
  updateLogWithResponse,
} from '@/lib/ai/debugLogger';
import {
  parseSceneAnchorText,
  parseKeyframePromptText,
  parseMotionPromptText,
} from '@/lib/ai/promptParsers';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ToastAction } from '@/components/ui/toast';
import { WorkflowStepper } from './WorkflowStepper';
import { BasicSettings } from './BasicSettings';
import { SceneSortable } from './SceneSortable';
import { StatisticsPanel } from './StatisticsPanel';
import { NarrativeCausalChainReadable } from './NarrativeCausalChainReadable';
import { NarrativeCausalChainVersionDialog } from './NarrativeCausalChainVersionDialog';
import {
  WorkflowWorkbench,
  type WorkflowAgentRunSummary,
  type WorkflowAgentStepSummary,
  type WorkflowSceneChildTaskSummary,
} from './WorkflowWorkbench';
import { CharacterRelationshipGraph } from './CharacterRelationshipGraph';
import { EmotionArcChart } from './EmotionArcChart';
import { SceneScriptEditor } from './SceneScriptEditor';
import { SoundDesignPanel } from './SoundDesignPanel';
import { DurationEstimateBar } from './DurationEstimateBar';

import { SceneDetailModal } from './SceneDetailModal';
import {
  CheckCircle2,
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
  Brain,
  Layers,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  Network,
  Clapperboard,
  LayoutGrid,
  Volume2,
} from 'lucide-react';

type WorkflowStep = 'workbench' | 'global' | 'causal' | 'plan' | 'episode' | 'export';

const CAUSAL_CHAIN_PHASES = [
  { phase: 1, name: '核心冲突', desc: '故事大纲 + 冲突引擎' },
  { phase: 2, name: '信息分层', desc: '信息能见度层 + 角色矩阵' },
  { phase: 3, name: '节拍流程', desc: '三/四幕结构的节拍设计' },
  { phase: 4, name: '叙事线交织', desc: '明暗线 + 自洽校验' },
] as const;

const EPISODE_AGENT_STEP_LABELS: Record<string, string> = {
  core_expression: '核心表达',
  scene_script: '分场脚本',
  scene_list: '分镜列表',
  scene_refinement: '分镜细化',
  sound_and_duration: '声音与时长',
};

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
type BatchFailedScene = { sceneId: string; order?: number; error?: string };

type BatchRefineProgress = NormalizedJobProgress & {
  totalScenes: number | null;
  currentSceneId: string | null;
  currentSceneOrder: number | null;
  completedSceneIds: string[];
  failedScenes: BatchFailedScene[];
};

type SceneChildTaskStats = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  unknown: number;
};

type WorkflowJobResultLike = {
  tokenUsage?: unknown;
  extractedJson?: unknown;
  raw?: unknown;
  executionMode?: unknown;
  fallbackUsed?: unknown;
  stepSummaries?: unknown;
  sceneChildTasks?: unknown;
  continued?: unknown;
  nextJobId?: unknown;
};

type CharacterExpansionCandidate = {
  tempId: string;
  name: string;
  aliases: string[];
  roleType: string;
  briefDescription: string;
  appearance: string;
  personality: string;
  background: string;
  confidence: number;
  evidence: string[];
};

type CharacterExpansionSnapshot = {
  runId: string;
  generatedAt: string;
  source: 'narrative_causal_chain';
  maxNewCharacters?: number;
  candidates: CharacterExpansionCandidate[];
  stats?: {
    total?: number;
    existingSkipped?: number;
    duplicatesResolved?: number;
    lowConfidenceSkipped?: number;
    finalCount?: number;
  };
};

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

function normalizeBatchRefineProgress(progress: unknown): BatchRefineProgress {
  const base = normalizeJobProgress(progress);
  const raw = progress as Record<string, unknown> | undefined;
  const totalScenes = typeof raw?.totalScenes === 'number' ? raw.totalScenes : null;
  const currentSceneId = typeof raw?.currentSceneId === 'string' ? raw.currentSceneId : null;
  const currentSceneOrder =
    typeof raw?.currentSceneOrder === 'number' ? raw.currentSceneOrder : null;
  const completedSceneIds = Array.isArray(raw?.completedSceneIds)
    ? raw?.completedSceneIds.filter((id): id is string => typeof id === 'string')
    : [];
  const failedScenes = Array.isArray(raw?.failedScenes)
    ? raw.failedScenes
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const sceneId = (entry as { sceneId?: unknown }).sceneId;
          const order = (entry as { order?: unknown }).order;
          const error = (entry as { error?: unknown }).error;
          if (typeof sceneId !== 'string') return null;
          return {
            sceneId,
            ...(typeof order === 'number' ? { order } : {}),
            ...(typeof error === 'string' ? { error } : {}),
          };
        })
        .filter((entry): entry is BatchFailedScene => entry !== null)
    : [];
  return {
    ...base,
    totalScenes,
    currentSceneId,
    currentSceneOrder,
    completedSceneIds,
    failedScenes,
  };
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

function safeText(value: unknown, maxLen = 1500): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLen);
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeCharacterExpansion(value: unknown): CharacterExpansionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const runId = safeText(raw.runId, 120);
  const generatedAt = safeText(raw.generatedAt, 120);
  const source = raw.source === 'narrative_causal_chain' ? 'narrative_causal_chain' : null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const candidate = item as Record<string, unknown>;
          const tempId = safeText(candidate.tempId, 120);
          const name = safeText(candidate.name, 80);
          if (!tempId || !name) return null;
          return {
            tempId,
            name,
            aliases: Array.isArray(candidate.aliases)
              ? candidate.aliases
                  .filter((alias): alias is string => typeof alias === 'string')
                  .map((alias) => alias.trim())
                  .filter(Boolean)
              : [],
            roleType: safeText(candidate.roleType, 40) || 'supporting',
            briefDescription: safeText(candidate.briefDescription, 1500),
            appearance: safeText(candidate.appearance, 1500),
            personality: safeText(candidate.personality, 1500),
            background: safeText(candidate.background, 1500),
            confidence:
              typeof candidate.confidence === 'number'
                ? Math.max(0, Math.min(1, candidate.confidence))
                : 0.75,
            evidence: Array.isArray(candidate.evidence)
              ? candidate.evidence
                  .filter((e): e is string => typeof e === 'string')
                  .map((e) => e.trim())
                  .filter(Boolean)
              : [],
          } satisfies CharacterExpansionCandidate;
        })
        .filter((candidate): candidate is CharacterExpansionCandidate => candidate !== null)
    : [];

  if (!runId || !generatedAt || !source) return null;
  return {
    runId,
    generatedAt,
    source,
    maxNewCharacters: typeof raw.maxNewCharacters === 'number' ? raw.maxNewCharacters : undefined,
    candidates,
    stats:
      raw.stats && typeof raw.stats === 'object'
        ? (raw.stats as CharacterExpansionSnapshot['stats'])
        : undefined,
  };
}

function normalizeSupervisorStepSummaries(value: unknown): WorkflowAgentStepSummary[] {
  if (!Array.isArray(value)) return [];
  const out: WorkflowAgentStepSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const statusRaw = raw.status;
    const status =
      statusRaw === 'succeeded' || statusRaw === 'failed' || statusRaw === 'skipped'
        ? statusRaw
        : null;
    const step = typeof raw.step === 'string' ? raw.step : '';
    if (!status || !step) continue;
    const executionModeRaw = raw.executionMode;
    const executionMode =
      executionModeRaw === 'agent' || executionModeRaw === 'legacy' ? executionModeRaw : undefined;
    const chunk =
      typeof raw.chunk === 'number' && Number.isFinite(raw.chunk) && raw.chunk > 0
        ? Math.floor(raw.chunk)
        : undefined;
    const sourceJobId =
      typeof raw.sourceJobId === 'string' && raw.sourceJobId.trim().length > 0
        ? raw.sourceJobId.trim()
        : undefined;
    out.push({
      step,
      status,
      message: safeText(raw.message, 400) || '-',
      ...(executionMode ? { executionMode } : {}),
      fallbackUsed: raw.fallbackUsed === true,
      ...(typeof chunk === 'number' ? { chunk } : {}),
      ...(sourceJobId ? { sourceJobId } : {}),
    });
  }
  return out;
}

function normalizeSupervisorRunSummary(value: unknown): WorkflowAgentRunSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const executionModeRaw = raw.executionMode;
  const executionMode =
    executionModeRaw === 'agent' || executionModeRaw === 'legacy' ? executionModeRaw : null;
  if (!executionMode) return null;
  return {
    executionMode,
    fallbackUsed: raw.fallbackUsed === true,
    stepSummaries: normalizeSupervisorStepSummaries(raw.stepSummaries),
    sceneChildTasks: normalizeSceneChildTasks(raw.sceneChildTasks),
    finishedAt: new Date().toISOString(),
  };
}

function normalizeSceneChildTasks(value: unknown): WorkflowSceneChildTaskSummary[] {
  if (!Array.isArray(value)) return [];
  const out: WorkflowSceneChildTaskSummary[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const sceneId = typeof raw.sceneId === 'string' ? raw.sceneId.trim() : '';
    const jobId = typeof raw.jobId === 'string' ? raw.jobId.trim() : '';
    const order =
      typeof raw.order === 'number' && Number.isFinite(raw.order) ? Math.floor(raw.order) : null;
    const statusRaw = raw.status;
    const status =
      statusRaw === 'queued' ||
      statusRaw === 'running' ||
      statusRaw === 'succeeded' ||
      statusRaw === 'failed' ||
      statusRaw === 'cancelled' ||
      statusRaw === 'unknown'
        ? statusRaw
        : 'unknown';
    if (!sceneId || !jobId || typeof order !== 'number' || order < 1) continue;
    const error = typeof raw.error === 'string' ? safeText(raw.error, 220) : '';
    const chunk =
      typeof raw.chunk === 'number' && Number.isFinite(raw.chunk) && raw.chunk > 0
        ? Math.floor(raw.chunk)
        : undefined;
    out.push({
      sceneId,
      order,
      jobId,
      status,
      ...(error ? { error } : {}),
      ...(typeof chunk === 'number' ? { chunk } : {}),
    });
  }
  return out;
}

function mergeSceneChildTaskMap(
  map: Map<string, WorkflowSceneChildTaskSummary>,
  tasks: WorkflowSceneChildTaskSummary[],
  fallbackChunk: number,
) {
  for (const task of tasks) {
    const key = `${task.sceneId}:${task.jobId}`;
    const prev = map.get(key);
    map.set(key, {
      ...task,
      chunk:
        typeof task.chunk === 'number' && Number.isFinite(task.chunk)
          ? task.chunk
          : (prev?.chunk ?? fallbackChunk),
    });
  }
}

function sortSceneChildTasks(
  tasks: WorkflowSceneChildTaskSummary[],
): WorkflowSceneChildTaskSummary[] {
  return tasks.slice().sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.jobId.localeCompare(b.jobId);
  });
}

function countSceneChildTaskStats(tasks: WorkflowSceneChildTaskSummary[]): SceneChildTaskStats {
  const stats: SceneChildTaskStats = {
    total: tasks.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
  };
  for (const task of tasks) {
    if (task.status === 'queued') stats.queued += 1;
    else if (task.status === 'running') stats.running += 1;
    else if (task.status === 'succeeded') stats.succeeded += 1;
    else if (task.status === 'failed') stats.failed += 1;
    else if (task.status === 'cancelled') stats.cancelled += 1;
    else stats.unknown += 1;
  }
  return stats;
}

function parseConflictJobInfo(errorMessage: string): { type: string; jobId: string } | null {
  const m = errorMessage.match(/\(([a-z0-9_]+):([A-Za-z0-9_-]+)\)/i);
  if (!m) return null;
  const type = m[1]?.trim();
  const jobId = m[2]?.trim();
  if (!type || !jobId) return null;
  return { type, jobId };
}

function getSceneChildTaskStatusLabel(status: WorkflowSceneChildTaskSummary['status']): string {
  const map: Record<WorkflowSceneChildTaskSummary['status'], string> = {
    queued: '排队中',
    running: '执行中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    unknown: '未知',
  };
  return map[status] ?? '未知';
}

function getEpisodeStateLabel(state: Episode['workflowState']): string {
  const labels: Record<string, string> = {
    IDLE: '未开始',
    SCRIPT_WRITING: '分场脚本中',
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
    sound_design_generating: '生成声音设计中',
    sound_design_confirmed: '声音设计已就绪',
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
    sound_design_generating: {
      className: 'border-cyan-200 bg-cyan-50 text-cyan-700',
      dotClass: 'bg-cyan-500',
    },
    sound_design_confirmed: {
      className: 'border-teal-200 bg-teal-50 text-teal-700',
      dotClass: 'bg-teal-500',
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
  const isGlobalBatchGenerating = useAIProgressStore((s) => s.isBatchGenerating);
  const batchGeneratingSource = useAIProgressStore((s) => s.batchGeneratingSource);
  const startBatchGenerating = useAIProgressStore((s) => s.startBatchGenerating);
  const stopBatchGenerating = useAIProgressStore((s) => s.stopBatchGenerating);
  const batchOperations = useAIProgressStore((s) => s.batchOperations);
  const updateBatchOperations = useAIProgressStore((s) => s.updateBatchOperations);
  const setBatchSelectedScenes = useAIProgressStore((s) => s.setBatchSelectedScenes);
  const addBatchCompletedScene = useAIProgressStore((s) => s.addBatchCompletedScene);
  const addBatchFailedScene = useAIProgressStore((s) => s.addBatchFailedScene);
  const { characters, loadCharacters, addCharacter } = useCharacterStore();
  const { elements: worldViewElements, loadElements: loadWorldViewElements } = useWorldViewStore();

  const {
    episodes,
    currentEpisodeId,
    isLoading: isEpisodesLoading,
    isRunningWorkflow,
    error: episodeError,
    lastJobProgress,
    loadEpisodes,
    setCurrentEpisode,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    planEpisodes,
    generateCoreExpression,
    generateCoreExpressionBatch,
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
  const {
    relationships: characterRelationships,
    isGenerating: isGeneratingRelationships,
    loadRelationships,
    generateRelationships,
  } = useCharacterRelationshipStore();
  const {
    emotionArc,
    isGenerating: isGeneratingEmotionArc,
    loadFromProject: loadEmotionArcFromProject,
    syncFromApi: syncEmotionArcFromApi,
    generateEmotionArc,
  } = useEmotionArcStore();

  const [activeStep, setActiveStep] = useState<WorkflowStep>('workbench');
  const [targetEpisodeCount, setTargetEpisodeCount] = useState<number | ''>('');
  const [sceneCountHint, setSceneCountHint] = useState<number | ''>('');
  const [isGeneratingSceneScript, setIsGeneratingSceneScript] = useState(false);
  const [isExpandingCharacters, setIsExpandingCharacters] = useState(false);
  const [isRunningWorkflowSupervisor, setIsRunningWorkflowSupervisor] = useState(false);
  const [supervisorRunSummary, setSupervisorRunSummary] = useState<WorkflowAgentRunSummary | null>(
    null,
  );
  const [isRunningEpisodeCreationAgent, setIsRunningEpisodeCreationAgent] = useState(false);
  const [episodeCreationRunSummary, setEpisodeCreationRunSummary] =
    useState<WorkflowAgentRunSummary | null>(null);
  const [episodeCreationLiveSceneChildTasks, setEpisodeCreationLiveSceneChildTasks] = useState<
    WorkflowSceneChildTaskSummary[]
  >([]);
  const [episodeCreationRunningJobId, setEpisodeCreationRunningJobId] = useState<string | null>(
    null,
  );
  const episodeCreationAbortRef = useRef<AbortController | null>(null);
  const [selectedExpansionCandidates, setSelectedExpansionCandidates] = useState<string[]>([]);
  const [isGeneratingSoundSceneId, setIsGeneratingSoundSceneId] = useState<string | null>(null);
  const [isEstimatingDurationSceneId, setIsEstimatingDurationSceneId] = useState<string | null>(
    null,
  );
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
  const [generatingKeyframePromptSceneId, setGeneratingKeyframePromptSceneId] = useState<
    string | null
  >(null);
  const [generatingSingleKeyframeKey, setGeneratingSingleKeyframeKey] =
    useState<GeneratedImageKeyframe | null>(null);
  const [generatingImagesSceneId, setGeneratingImagesSceneId] = useState<string | null>(null);
  const [generatingSingleImageKey, setGeneratingSingleImageKey] =
    useState<GeneratedImageKeyframe | null>(null);
  const [_generatingImagesProgress, setGeneratingImagesProgress] =
    useState<NormalizedJobProgress | null>(null);
  const generatingImagesAbortRef = useRef<AbortController | null>(null);
  const [generatingVideoSceneId, setGeneratingVideoSceneId] = useState<string | null>(null);
  const [refineAllProgress, setRefineAllProgress] = useState<BatchRefineProgress | null>(null);
  const [refineAllJobRunning, setRefineAllJobRunning] = useState(false);
  const [refineAllFailedScenes, setRefineAllFailedScenes] = useState<BatchFailedScene[]>([]);
  const [batchRefineDialogOpen, setBatchRefineDialogOpen] = useState(false);
  const [batchRefineSelectedIds, setBatchRefineSelectedIds] = useState<string[]>([]);
  const [batchRefineErrors, setBatchRefineErrors] = useState<Record<string, string>>({});
  const batchRefineAbortRef = useRef<AbortController | null>(null);
  const batchRefineAllowCloseRef = useRef(false);

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
  const [, setHasChainUnversionedChanges] = useState(false);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  const [exportContent, setExportContent] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (activeStep !== 'episode' || !selectedSceneId) return;
    const el = document.querySelector(`[data-scene-id="${selectedSceneId}"]`);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [activeStep, selectedSceneId]);

  const currentEpisode = useMemo(() => {
    return currentEpisodeId ? (episodes.find((e) => e.id === currentEpisodeId) ?? null) : null;
  }, [currentEpisodeId, episodes]);

  const styleFullPrompt = useMemo(() => getStyleFullPrompt(currentProject), [currentProject]);
  const projectCharacters = useMemo(() => {
    if (!currentProject?.id) return [];
    return characters.filter((c) => c.projectId === currentProject.id);
  }, [characters, currentProject?.id]);
  const characterExpansion = useMemo(
    () => normalizeCharacterExpansion(currentProject?.contextCache?.characterExpansion),
    [currentProject?.contextCache?.characterExpansion],
  );
  const aiProfileId = config?.aiProfileId ?? null;
  const displayedSceneChildTasks = useMemo(() => {
    if (episodeCreationRunSummary?.sceneChildTasks?.length) {
      return episodeCreationRunSummary.sceneChildTasks;
    }
    return episodeCreationLiveSceneChildTasks;
  }, [episodeCreationLiveSceneChildTasks, episodeCreationRunSummary?.sceneChildTasks]);
  const displayedSceneChildTaskStats = useMemo(
    () => countSceneChildTaskStats(displayedSceneChildTasks),
    [displayedSceneChildTasks],
  );
  const failedEpisodeSceneChildTaskSceneIds = useMemo(() => {
    if (!displayedSceneChildTasks.length) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const task of displayedSceneChildTasks) {
      if (task.status !== 'failed' && task.status !== 'cancelled') continue;
      if (seen.has(task.sceneId)) continue;
      seen.add(task.sceneId);
      ids.push(task.sceneId);
    }
    return ids;
  }, [displayedSceneChildTasks]);
  const sortedScenes = useMemo(() => {
    return scenes.slice().sort((a, b) => a.order - b.order);
  }, [scenes]);
  const recommendedBatchRefineIds = useMemo(() => {
    // 推荐：未“完整完成”的分镜（completed + dialogues>0 视为完整完成）
    return sortedScenes
      .filter((s) => {
        const hasDialogues = Array.isArray(s.dialogues) && s.dialogues.length > 0;
        return !(s.status === 'completed' && hasDialogues);
      })
      .map((s) => s.id);
  }, [sortedScenes]);
  const isBatchBlocked = isGlobalBatchGenerating && batchGeneratingSource !== 'episode_workflow';
  const isBatchRefineRunning =
    isGlobalBatchGenerating &&
    batchGeneratingSource === 'episode_workflow' &&
    batchOperations.isProcessing;
  const canRetryFailedEpisodeSceneChildren =
    failedEpisodeSceneChildTaskSceneIds.length > 0 &&
    Boolean(aiProfileId && currentProject?.id) &&
    !isRunningEpisodeCreationAgent &&
    !refineAllJobRunning &&
    !isBatchRefineRunning &&
    !isGlobalBatchGenerating;

  const _openBatchRefineDialog = () => {
    setBatchRefineErrors({});
    setBatchRefineSelectedIds(recommendedBatchRefineIds);
    setBatchRefineDialogOpen(true);
  };

  const setBatchSelectAll = () => {
    setBatchRefineSelectedIds(sortedScenes.map((s) => s.id));
  };

  const setBatchSelectRecommended = () => {
    setBatchRefineSelectedIds(recommendedBatchRefineIds);
  };

  const setBatchSelectNone = () => {
    setBatchRefineSelectedIds([]);
  };

  useEffect(() => {
    if (!characterExpansion) {
      setSelectedExpansionCandidates([]);
      return;
    }
    setSelectedExpansionCandidates(
      characterExpansion.candidates.map((candidate) => candidate.tempId),
    );
  }, [characterExpansion, characterExpansion?.runId]);

  const toggleBatchSelect = (sceneId: string, checked: boolean) => {
    setBatchRefineSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sceneId);
      else next.delete(sceneId);
      return Array.from(next);
    });
  };

  const batchRefineSelectedSet = useMemo(() => {
    return new Set(batchRefineSelectedIds);
  }, [batchRefineSelectedIds]);
  const batchCompletedSet = useMemo(() => {
    return new Set(batchOperations.completedScenes);
  }, [batchOperations.completedScenes]);
  const batchFailedSet = useMemo(() => {
    return new Set(batchOperations.failedScenes);
  }, [batchOperations.failedScenes]);

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
    void loadRelationships(currentProject.id);
    loadEmotionArcFromProject(currentProject);
  }, [
    currentProject,
    loadEpisodes,
    loadCharacters,
    loadWorldViewElements,
    loadRelationships,
    loadEmotionArcFromProject,
  ]);

  useEffect(() => {
    if (!currentProject?.id) return;
    if (!currentEpisodeId) return;
    loadScenes(currentProject.id, currentEpisodeId);
  }, [currentProject?.id, currentEpisodeId, loadScenes]);

  useEffect(() => {
    return () => {
      batchRefineAbortRef.current?.abort();
    };
  }, []);

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
        setHasChainUnversionedChanges(
          Number.isFinite(updatedTs) && Number.isFinite(latestTs) ? updatedTs > latestTs : false,
        );
      } catch {
        if (cancelled) return;
        setChainVersionCount(null);
        setHasChainUnversionedChanges(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentProject?.id,
    currentProject?.contextCache?.narrativeCausalChain,
    currentProject?.contextCache?.narrativeCausalChainUpdatedAt,
  ]);

  const _steps: Array<{ id: WorkflowStep; name: string }> = [
    { id: 'workbench', name: '工作台' },
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

  const handleGenerateCoreExpressionBatch = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    try {
      const missingEpisodeIds = episodes.filter((ep) => !ep.coreExpression).map((ep) => ep.id);
      if (missingEpisodeIds.length === 0) {
        toast({ title: '无需生成', description: '所有 Episode 都已有核心表达。' });
        return;
      }
      toast({
        title: '批量生成核心表达',
        description: `已入队，将生成 ${missingEpisodeIds.length} 集（自动跳过已生成）。`,
      });
      await generateCoreExpressionBatch({
        projectId: currentProject.id,
        aiProfileId,
        episodeIds: missingEpisodeIds,
      });
      toast({ title: '批量生成完成', description: '核心表达已写入 Episodes。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '批量生成失败', description: detail, variant: 'destructive' });
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

  const handleGenerateSceneScript = async () => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    setIsGeneratingSceneScript(true);
    try {
      toast({ title: '生成分场脚本', description: '已入队，正在等待 AI 完成...' });
      const job = await apiWorkflowGenerateSceneScript({
        projectId: currentProject.id,
        episodeId: currentEpisode.id,
        aiProfileId,
      });
      await apiWaitForAIJob(job.id, {
        onProgress: () => undefined,
      });
      loadEpisodes(currentProject.id);
      toast({ title: '分场脚本已生成', description: `第 ${currentEpisode.order} 集脚本已更新。` });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '分场脚本生成失败', description: detail, variant: 'destructive' });
    } finally {
      setIsGeneratingSceneScript(false);
    }
  };

  const handleSaveSceneScriptDraft = async (next: SceneScriptBlock[]) => {
    if (!currentProject?.id || !currentEpisode?.id) return;
    try {
      await updateEpisode(currentProject.id, currentEpisode.id, { sceneScriptDraft: next });
      toast({ title: '已保存', description: '分场脚本草稿已更新。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '保存失败', description: detail, variant: 'destructive' });
    }
  };

  const handleGenerateEmotionArc = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    try {
      toast({ title: '生成情绪弧线', description: '已入队，正在等待 AI 完成...' });
      await generateEmotionArc({ projectId: currentProject.id, aiProfileId });
      toast({ title: '情绪弧线已生成', description: '已更新项目级情绪弧线。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '情绪弧线生成失败', description: detail, variant: 'destructive' });
    }
  };

  const handleGenerateCharacterRelationships = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    try {
      toast({ title: '生成角色关系图谱', description: '已入队，正在等待 AI 完成...' });
      await generateRelationships({ projectId: currentProject.id, aiProfileId });
      toast({ title: '角色关系图谱已生成', description: '关系网络已更新。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '关系图谱生成失败', description: detail, variant: 'destructive' });
    }
  };

  const handleExpandStoryCharacters = async () => {
    if (!isApiMode()) {
      toast({ title: '当前模式不支持', description: '角色体系扩充仅在 API 模式可用。' });
      return;
    }
    if (!aiProfileId || !currentProject?.id) return;
    setIsExpandingCharacters(true);

    const logId = logAICall('character_expansion', {
      skillName: 'workflow:expand_story_characters',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/characters/expand',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/characters/expand`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            aiProfileId,
            maxNewCharacters: 8,
          }),
        },
      ],
      context: {
        projectId: currentProject.id,
        systemPromptKeys: ['workflow.character_expansion.system'],
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    try {
      toast({ title: '丰满角色体系', description: '已入队，正在等待 AI 生成候选角色...' });
      const job = await apiWorkflowExpandStoryCharacters({
        projectId: currentProject.id,
        aiProfileId,
        maxNewCharacters: 8,
      });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          if (typeof next.pct === 'number') {
            updateLogProgress(logId, next.pct, next.message ?? undefined);
          }
        },
      });

      const result = (finished.result ?? null) as WorkflowJobResultLike | null;
      const tokenUsage = normalizeJobTokenUsage(result?.tokenUsage);
      const content =
        typeof result?.extractedJson === 'string'
          ? result.extractedJson
          : typeof result?.raw === 'string'
            ? result.raw
            : safeJsonStringify(result);
      updateLogWithResponse(logId, { content, tokenUsage });

      useProjectStore.getState().loadProject(currentProject.id);
      toast({ title: '角色候选已生成', description: '请在下方勾选并导入角色库。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, detail);
      toast({ title: '角色扩充失败', description: detail, variant: 'destructive' });
    } finally {
      setIsExpandingCharacters(false);
    }
  };

  const handleRunWorkflowSupervisor = async () => {
    if (!isApiMode()) {
      toast({ title: '当前模式不支持', description: 'Supervisor 仅在 API 模式可用。' });
      return;
    }
    if (!aiProfileId || !currentProject?.id) return;
    setIsRunningWorkflowSupervisor(true);

    const logId = logAICall('custom', {
      skillName: 'workflow:run_workflow_supervisor',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/supervisor/run',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/supervisor/run`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            aiProfileId,
          }),
        },
      ],
      context: {
        projectId: currentProject.id,
        systemPromptKeys: ['workflow.supervisor.agent.system'],
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    try {
      toast({ title: '启动 Agent 流程', description: '已入队，正在按步骤自动执行...' });
      const job = await apiWorkflowRunSupervisor({
        projectId: currentProject.id,
        aiProfileId,
      });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          if (typeof next.pct === 'number') {
            updateLogProgress(logId, next.pct, next.message ?? undefined);
          }
        },
      });

      const result = (finished.result ?? null) as WorkflowJobResultLike | null;
      const content = safeJsonStringify(result);
      updateLogWithResponse(logId, { content });

      const executionMode =
        result?.executionMode === 'agent' || result?.executionMode === 'legacy'
          ? result.executionMode
          : 'legacy';
      const fallbackUsed = result?.fallbackUsed === true;
      const normalizedSummary =
        normalizeSupervisorRunSummary(result) ??
        ({
          executionMode,
          fallbackUsed,
          stepSummaries: [],
          finishedAt: new Date().toISOString(),
        } satisfies WorkflowAgentRunSummary);
      setSupervisorRunSummary(normalizedSummary);

      await useProjectStore.getState().loadProject(currentProject.id);
      await loadEpisodes(currentProject.id);
      await loadRelationships(currentProject.id);
      await syncEmotionArcFromApi(currentProject.id);
      if (currentEpisode?.id) {
        await loadScenes(currentProject.id, currentEpisode.id);
      }

      toast({
        title: 'Agent 流程完成',
        description: `执行模式：${executionMode}${fallbackUsed ? '（含自动降级）' : ''}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      updateLogWithError(logId, detail);
      toast({ title: 'Agent 流程失败', description: detail, variant: 'destructive' });
    } finally {
      setIsRunningWorkflowSupervisor(false);
    }
  };

  const handleCancelEpisodeCreationAgent = async (jobId?: string): Promise<boolean> => {
    const targetJobId = jobId || episodeCreationRunningJobId;
    const controller = episodeCreationAbortRef.current;
    if (controller && !controller.signal.aborted) {
      controller.abort();
      return true;
    }
    if (!targetJobId) return false;
    try {
      await apiCancelAIJob(targetJobId);
      toast({ title: '已取消任务', description: `Job ${targetJobId} 已取消。` });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '取消失败', description: detail, variant: 'destructive' });
      return false;
    }
  };

  const handleCancelAndRetryEpisodeCreationAgent = async (conflictJobId: string) => {
    const cancelled = await handleCancelEpisodeCreationAgent(conflictJobId);
    if (!cancelled) return;
    await handleRunEpisodeCreationAgent();
  };

  const handleRunEpisodeCreationAgent = async () => {
    if (!isApiMode()) {
      toast({ title: '当前模式不支持', description: '单集创作 Agent 仅在 API 模式可用。' });
      return;
    }
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    setEpisodeCreationRunSummary(null);
    setEpisodeCreationLiveSceneChildTasks([]);
    setIsRunningEpisodeCreationAgent(true);
    const abortController = new AbortController();
    episodeCreationAbortRef.current = abortController;

    const logId = logAICall('custom', {
      skillName: 'workflow:run_episode_creation_agent',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/episodes/{{episodeId}}/agent-run',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/episodes/${currentEpisode.id}/agent-run`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            episodeId: currentEpisode.id,
            aiProfileId,
          }),
        },
      ],
      context: {
        projectId: currentProject.id,
        episodeId: currentEpisode.id,
        systemPromptKeys: ['workflow.episode_creation.agent.system'],
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    try {
      toast({ title: '启动单集创作 Agent', description: '已入队，正在分步骤生成并落库...' });
      const job = await apiWorkflowRunEpisodeCreationAgent({
        projectId: currentProject.id,
        episodeId: currentEpisode.id,
        aiProfileId,
      });
      let currentJobId: string | null = job.id;
      let executionMode: 'agent' | 'legacy' = 'legacy';
      let fallbackUsed = false;
      const mergedStepSummaries: WorkflowAgentStepSummary[] = [];
      const mergedSceneChildTasks = new Map<string, WorkflowSceneChildTaskSummary>();
      const chainResults: WorkflowJobResultLike[] = [];

      for (let hop = 0; hop < 120 && currentJobId; hop += 1) {
        setEpisodeCreationRunningJobId(currentJobId);
        const finished = await apiWaitForAIJob(currentJobId, {
          signal: abortController.signal,
          timeoutMs: 30 * 60_000,
          onProgress: (progress) => {
            const next = normalizeJobProgress(progress);
            if (typeof next.pct === 'number') {
              updateLogProgress(logId, next.pct, next.message ?? undefined);
            }
            if (progress && typeof progress === 'object') {
              const progressRecord = progress as Record<string, unknown>;
              const nextSceneChildTasks = normalizeSceneChildTasks(progressRecord.sceneChildTasks);
              if (nextSceneChildTasks.length > 0) {
                mergeSceneChildTaskMap(mergedSceneChildTasks, nextSceneChildTasks, hop + 1);
                setEpisodeCreationLiveSceneChildTasks(
                  sortSceneChildTasks(Array.from(mergedSceneChildTasks.values())),
                );
              }
            }
          },
        });

        const result = (finished.result ?? null) as WorkflowJobResultLike | null;
        if (result) {
          chainResults.push(result);
          if (result.executionMode === 'agent' || result.executionMode === 'legacy') {
            executionMode = result.executionMode;
          }
          if (result.fallbackUsed === true) {
            fallbackUsed = true;
          }
          const nextStepSummaries = normalizeSupervisorStepSummaries(result.stepSummaries);
          if (nextStepSummaries.length > 0) {
            mergedStepSummaries.push(
              ...nextStepSummaries.map((step) => ({
                ...step,
                chunk:
                  typeof step.chunk === 'number' && Number.isFinite(step.chunk)
                    ? step.chunk
                    : hop + 1,
                ...(step.sourceJobId
                  ? { sourceJobId: step.sourceJobId }
                  : currentJobId
                    ? { sourceJobId: currentJobId }
                    : {}),
              })),
            );
          }
          const nextSceneChildTasks = normalizeSceneChildTasks(result.sceneChildTasks);
          if (nextSceneChildTasks.length > 0) {
            mergeSceneChildTaskMap(mergedSceneChildTasks, nextSceneChildTasks, hop + 1);
            setEpisodeCreationLiveSceneChildTasks(
              sortSceneChildTasks(Array.from(mergedSceneChildTasks.values())),
            );
          }
        }

        const nextJobIdRaw = result?.nextJobId;
        const hasContinuation =
          result?.continued === true &&
          typeof nextJobIdRaw === 'string' &&
          nextJobIdRaw.trim().length > 0;
        if (!hasContinuation) {
          currentJobId = null;
          break;
        }
        currentJobId = nextJobIdRaw;
      }

      updateLogWithResponse(logId, {
        content: safeJsonStringify({
          executionMode,
          fallbackUsed,
          chunks: chainResults,
        }),
      });

      const normalizedSummary = {
        executionMode,
        fallbackUsed,
        stepSummaries: mergedStepSummaries,
        sceneChildTasks: sortSceneChildTasks(Array.from(mergedSceneChildTasks.values())),
        finishedAt: new Date().toISOString(),
      } satisfies WorkflowAgentRunSummary;
      setEpisodeCreationRunSummary(normalizedSummary);

      await useProjectStore.getState().loadProject(currentProject.id);
      await loadEpisodes(currentProject.id);
      await loadScenes(currentProject.id, currentEpisode.id);

      toast({
        title: '单集创作 Agent 完成',
        description: `执行模式：${executionMode}${fallbackUsed ? '（含自动降级）' : ''}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === 'AbortError') {
        updateLogWithCancelled(logId);
        toast({ title: '已取消', description: '单集创作 Agent 已取消。' });
      } else {
        updateLogWithError(logId, detail);
        const conflict = parseConflictJobInfo(detail);
        if (conflict) {
          toast({
            title: '已有任务进行中',
            description: `检测到冲突任务 ${conflict.jobId}，可取消后重试。`,
            action: (
              <ToastAction
                altText="取消并重试"
                onClick={() => {
                  void handleCancelAndRetryEpisodeCreationAgent(conflict.jobId);
                }}
              >
                取消并重试
              </ToastAction>
            ),
          });
        } else {
          toast({ title: '单集创作 Agent 失败', description: detail, variant: 'destructive' });
        }
      }
    } finally {
      episodeCreationAbortRef.current = null;
      setEpisodeCreationRunningJobId(null);
      setIsRunningEpisodeCreationAgent(false);
    }
  };

  const toggleExpansionCandidate = (tempId: string, checked: boolean) => {
    setSelectedExpansionCandidates((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tempId);
      else next.delete(tempId);
      return Array.from(next);
    });
  };

  const handleImportExpandedCharacters = () => {
    if (!currentProject?.id || !characterExpansion) return;

    const selected = characterExpansion.candidates.filter((candidate) =>
      selectedExpansionCandidates.includes(candidate.tempId),
    );
    if (selected.length === 0) {
      toast({ title: '未选择角色', description: '请先勾选要导入的候选角色。' });
      return;
    }

    const existingNameKeys = new Set(
      projectCharacters.map((character) => normalizeNameKey(character.name)),
    );
    let imported = 0;
    let skipped = 0;

    for (const candidate of selected) {
      const key = normalizeNameKey(candidate.name);
      if (!key || existingNameKeys.has(key)) {
        skipped += 1;
        continue;
      }
      existingNameKeys.add(key);
      addCharacter(currentProject.id, {
        projectId: currentProject.id,
        name: candidate.name,
        briefDescription: candidate.briefDescription || undefined,
        avatar: undefined,
        appearance: candidate.appearance || '',
        personality: candidate.personality || '',
        background: candidate.background || '',
        portraitPrompts: undefined,
        customStyle: undefined,
        relationships: [],
        appearances: [],
        themeColor: undefined,
        primaryColor: undefined,
        secondaryColor: undefined,
      });
      imported += 1;
    }

    if (imported > 0) {
      loadCharacters(currentProject.id);
    }

    const handledTempIds = new Set(selected.map((candidate) => candidate.tempId));
    const remainingCandidates = characterExpansion.candidates.filter(
      (candidate) => !handledTempIds.has(candidate.tempId),
    );
    const baseCache =
      currentProject.contextCache && typeof currentProject.contextCache === 'object'
        ? (currentProject.contextCache as Record<string, unknown>)
        : {};

    updateProject(currentProject.id, {
      contextCache: {
        ...baseCache,
        characterExpansion: {
          ...characterExpansion,
          candidates: remainingCandidates,
          stats: {
            ...(characterExpansion.stats ?? {}),
            finalCount: remainingCandidates.length,
          },
        },
        characterExpansionUpdatedAt: new Date().toISOString(),
      },
    });

    toast({
      title: '角色导入完成',
      description:
        skipped > 0
          ? `导入 ${imported} 个角色，跳过 ${skipped} 个重复项。`
          : `导入 ${imported} 个角色。`,
    });
  };

  const handleGenerateSoundDesign = async (sceneId: string) => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    setIsGeneratingSoundSceneId(sceneId);
    try {
      const job = await apiWorkflowGenerateSoundDesign({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
      });
      await apiWaitForAIJob(job.id, { onProgress: () => undefined });
      loadScenes(currentProject.id, currentEpisode.id);
      toast({ title: '声音设计完成', description: '已写回当前分镜。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '声音设计失败', description: detail, variant: 'destructive' });
    } finally {
      setIsGeneratingSoundSceneId(null);
    }
  };

  const handleEstimateDuration = async (sceneId: string) => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    setIsEstimatingDurationSceneId(sceneId);
    try {
      const job = await apiWorkflowEstimateDuration({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
      });
      await apiWaitForAIJob(job.id, { onProgress: () => undefined });
      loadScenes(currentProject.id, currentEpisode.id);
      toast({ title: '时长估算完成', description: '已写回当前分镜。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '时长估算失败', description: detail, variant: 'destructive' });
    } finally {
      setIsEstimatingDurationSceneId(null);
    }
  };

  const handleSetProjectArtifactStatus = (
    artifact: 'bible' | 'seasonArc',
    status: ArtifactStatus,
  ) => {
    if (!currentProject?.id) return;
    updateProject(currentProject.id, buildProjectArtifactPatch(currentProject, artifact, status));
    const artifactLabel = artifact === 'bible' ? '项目圣经' : '主线弧线';
    const statusLabel = status === 'draft' ? '草稿' : status === 'review' ? '评审' : '锁定';
    toast({
      title: '已更新产物状态',
      description: `「${artifactLabel}」已设为「${statusLabel}」。`,
    });
  };

  const handleSetEpisodeArtifactStatus = async (
    artifact: 'outline' | 'storyboard' | 'promptPack',
    status: ArtifactStatus,
  ) => {
    if (!currentProject?.id || !currentEpisode?.id) return;
    try {
      await updateEpisode(
        currentProject.id,
        currentEpisode.id,
        buildEpisodeArtifactPatch(currentEpisode, artifact, status),
      );
      const artifactLabel =
        artifact === 'outline'
          ? '本集 Outline'
          : artifact === 'storyboard'
            ? '分镜脚本'
            : '提示词包';
      const statusLabel = status === 'draft' ? '草稿' : status === 'review' ? '评审' : '锁定';
      toast({
        title: '已更新产物状态',
        description: `「${artifactLabel}」已设为「${statusLabel}」。`,
      });
    } catch (error) {
      toast({
        title: '更新失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  type RefineAllRunOptions = {
    signal?: AbortSignal;
    onProgress?: (next: NormalizedJobProgress) => void;
    extraContext?: Record<string, unknown>;
  };

  const runRefineSceneAllJob = async (sceneId: string, options?: RefineAllRunOptions) => {
    if (!aiProfileId || !currentProject?.id) {
      throw new Error('缺少 aiProfileId 或 projectId，无法执行分镜细化');
    }

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
            ...options?.extraContext,
          }),
        },
      ],
      context: {
        systemPromptKeys: [
          'workflow.scene_anchor.system',
          'workflow.action_beats.action_plan.system',
          'workflow.action_beats.action_plan.repair.system',
          'workflow.action_beats.keyframe_group.system',
          'workflow.action_beats.keyframe_group.repair.system',
          'workflow.action_beats.continuity_repair.system',
          'workflow.format_fix.scene_anchor.system',
          'workflow.format_fix.keyframe_prompt.system',
          'workflow.format_fix.motion_prompt.system',
          'workflow.motion_prompt.system',
          'workflow.dialogue.system',
          'workflow.dialogue.fix.system',
        ],
        projectId: currentProject.id,
        sceneId,
        sceneOrder: currentScene?.order,
        sceneSummary: currentScene?.summary,
        ...options?.extraContext,
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    try {
      const job = await apiWorkflowRefineSceneAll({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
      });

      const finished = await apiWaitForAIJob(job.id, {
        signal: options?.signal,
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          options?.onProgress?.(next);
          if (typeof next.pct === 'number') {
            updateLogProgress(logId, next.pct, next.message ?? undefined);
          }
        },
      });

      const result = (finished.result ?? null) as unknown;
      const tokenUsage = normalizeJobTokenUsage(
        result && typeof result === 'object'
          ? (result as { tokenUsage?: unknown }).tokenUsage
          : null,
      );
      updateLogWithResponse(logId, { content: safeJsonStringify(result), tokenUsage });
      return { result, tokenUsage };
    } catch (error) {
      if (isAbortError(error)) {
        updateLogWithCancelled(logId);
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        updateLogWithError(logId, detail);
      }
      throw error;
    }
  };

  const handleRefineSceneAll = async (sceneId: string) => {
    if (!aiProfileId || !currentProject?.id) return;
    if (isGlobalBatchGenerating && batchGeneratingSource !== 'episode_workflow') {
      toast({
        title: '批量任务进行中',
        description: '当前有其他批量操作正在执行，请等待完成后再细化。',
        variant: 'destructive',
      });
      return;
    }

    setIsRefining(true);
    setRefiningSceneId(sceneId);
    setRefineJobProgress(null);
    try {
      await flushApiEpisodeScenePatchQueue().catch(() => {});
      await runRefineSceneAllJob(sceneId, { onProgress: (next) => setRefineJobProgress(next) });
      if (currentEpisode?.id) loadScenes(currentProject.id, currentEpisode.id);
      toast({ title: '分镜细化完成', description: '已更新当前分镜内容。' });
    } catch (error) {
      if (!isAbortError(error)) {
        const detail = error instanceof Error ? error.message : String(error);
        toast({ title: '分镜细化失败', description: detail, variant: 'destructive' });
      }
    } finally {
      setIsRefining(false);
      setRefiningSceneId(null);
      setRefineJobProgress(null);
    }
  };

  const runGenerateKeyframePromptJob = async (sceneId: string): Promise<string> => {
    if (!aiProfileId || !currentProject?.id) {
      throw new Error('缺少 aiProfileId 或 projectId，无法生成关键帧提示词');
    }
    const job = await apiWorkflowGenerateKeyframePrompt({
      projectId: currentProject.id,
      sceneId,
      aiProfileId,
    });
    const finished = await apiWaitForAIJob(job.id);
    const result = finished.result as { shotPrompt?: unknown } | null;
    const shotPrompt = typeof result?.shotPrompt === 'string' ? result.shotPrompt.trim() : '';
    if (!shotPrompt) {
      throw new Error('关键帧提示词生成结果为空');
    }
    return shotPrompt;
  };

  const assertCanGenerateKeyframePrompt = (sceneId: string): Scene | null => {
    if (!aiProfileId || !currentProject?.id) {
      toast({
        title: '配置缺失',
        description: '请先配置 AI Profile。',
        variant: 'destructive',
      });
      return null;
    }
    if (isGlobalBatchGenerating && batchGeneratingSource !== 'episode_workflow') {
      toast({
        title: '批量任务进行中',
        description: '当前有其他批量操作正在执行，请等待完成后再生成关键帧提示词。',
        variant: 'destructive',
      });
      return null;
    }
    const currentScene = scenes.find((s) => s.id === sceneId);
    if (!currentScene) {
      toast({
        title: '分镜不存在',
        description: '无法找到指定分镜。',
        variant: 'destructive',
      });
      return null;
    }
    return currentScene;
  };

  const handleGenerateKeyframePrompt = async (sceneId: string) => {
    const currentScene = assertCanGenerateKeyframePrompt(sceneId);
    if (!currentScene) return;
    const projectId = currentProject?.id;
    if (!projectId) return;
    if (generatingKeyframePromptSceneId === sceneId) {
      toast({
        title: '请稍候',
        description: '该分镜的关键帧提示词正在生成中。',
      });
      return;
    }

    setGeneratingKeyframePromptSceneId(sceneId);
    setGeneratingSingleKeyframeKey(null);
    try {
      await runGenerateKeyframePromptJob(sceneId);
      if (currentEpisode?.id) {
        loadScenes(projectId, currentEpisode.id);
      }
      toast({
        title: currentScene.shotPrompt?.trim() ? '关键帧提示词已重生成' : '关键帧提示词已生成',
        description: '已写入 KF0-KF8（9 宫格）关键帧提示词。',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({
        title: '生成关键帧提示词失败',
        description: detail,
        variant: 'destructive',
      });
    } finally {
      setGeneratingKeyframePromptSceneId(null);
      setGeneratingSingleKeyframeKey(null);
    }
  };

  const handleGenerateSingleKeyframePrompt = async (
    sceneId: string,
    keyframeKey: GeneratedImageKeyframe,
  ) => {
    const currentScene = assertCanGenerateKeyframePrompt(sceneId);
    if (!currentScene) return;
    const projectId = currentProject?.id;
    if (!projectId) return;
    if (generatingKeyframePromptSceneId === sceneId) {
      toast({
        title: '请稍候',
        description: '该分镜已有关键帧提示词任务在执行。',
      });
      return;
    }

    setGeneratingKeyframePromptSceneId(sceneId);
    setGeneratingSingleKeyframeKey(keyframeKey);
    try {
      const regeneratedPrompt = await runGenerateKeyframePromptJob(sceneId);
      const mergedShotPrompt = mergeSingleKeyframePrompt({
        existingPrompt: currentScene.shotPrompt || '',
        regeneratedPrompt,
        keyframeKey,
      });

      if (currentEpisode?.id) {
        updateScene(projectId, currentEpisode.id, sceneId, {
          shotPrompt: mergedShotPrompt,
          status: 'keyframe_confirmed',
        });
        await flushApiEpisodeScenePatchQueue().catch(() => {});
        loadScenes(projectId, currentEpisode.id);
      }

      toast({
        title: `${keyframeKey} 提示词已更新`,
        description: '仅覆盖当前关键帧，其余关键帧保持不变。',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({
        title: `${keyframeKey} 生成失败`,
        description: detail,
        variant: 'destructive',
      });
    } finally {
      setGeneratingKeyframePromptSceneId(null);
      setGeneratingSingleKeyframeKey(null);
    }
  };

  const handleGenerateKeyframeImages = async (
    sceneId: string,
    keyframeKey?: GeneratedImageKeyframe,
  ) => {
    // 1. 前置条件验证：必须有 aiProfileId 和 projectId
    if (!aiProfileId || !currentProject?.id) {
      toast({
        title: '配置缺失',
        description: '请先配置 AI Profile。',
        variant: 'destructive',
      });
      return;
    }

    // 2. 检查批量任务冲突
    if (isGlobalBatchGenerating && batchGeneratingSource !== 'episode_workflow') {
      toast({
        title: '批量任务进行中',
        description: '当前有其他批量操作正在执行，请等待完成后再生成图片。',
        variant: 'destructive',
      });
      return;
    }

    // 3. 防止重复提交：检查是否已经在生成该场景的图片
    if (generatingImagesSceneId === sceneId) {
      toast({
        title: '请稍候',
        description: keyframeKey
          ? `${keyframeKey} 图片正在生成中。`
          : '该分镜的关键帧图片正在生成中。',
      });
      return;
    }

    // 4. 获取当前场景数据并验证前置条件
    const currentScene = scenes.find((s) => s.id === sceneId);
    if (!currentScene) {
      toast({
        title: '分镜不存在',
        description: '无法找到指定的分镜数据。',
        variant: 'destructive',
      });
      return;
    }

    // 5. 检查关键帧提示词是否已生成（这是图片生成的前置条件）
    if (!currentScene.shotPrompt?.trim()) {
      toast({
        title: '前置条件未满足',
        description:
          '请先生成关键帧提示词（KF0-KF8），再生成图片。可通过「一键细化」完成所有步骤。',
        variant: 'destructive',
      });
      return;
    }

    // 6. 创建 AbortController 用于取消支持
    const abortController = new AbortController();
    generatingImagesAbortRef.current = abortController;

    // 7. AI 调用日志记录
    const logId = logAICall('custom', {
      skillName: 'workflow:generate_keyframe_images',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/scenes/{{sceneId}}/generate-images',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/scenes/${sceneId}/generate-images`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            sceneId,
            aiProfileId,
            keyframeKey: keyframeKey ?? null,
            sceneOrder: currentScene.order,
            sceneSummary: currentScene.summary,
          }),
        },
      ],
      context: {
        projectId: currentProject.id,
        sceneId,
        sceneOrder: currentScene.order,
        sceneSummary: currentScene.summary,
        keyframeKey: keyframeKey ?? null,
        shotPromptLength: currentScene.shotPrompt?.length ?? 0,
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    // 8. 设置加载状态
    setGeneratingImagesSceneId(sceneId);
    setGeneratingSingleImageKey(keyframeKey ?? null);
    setGeneratingImagesProgress({ pct: 0, message: '准备生成关键帧图片...' });

    // 用于跟踪上一次刷新时的图片数量，避免重复刷新
    let lastRefreshedImageCount = 0;

    try {
      // 9. 先刷新待保存的更改
      await flushApiEpisodeScenePatchQueue().catch(() => {});

      // 10. 发起 API 请求
      const job = await apiWorkflowGenerateKeyframeImages({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
        ...(keyframeKey ? { keyframeKey } : {}),
      });

      // 11. 等待任务完成，带进度回调 + 实时刷新
      const finished = await apiWaitForAIJob(job.id, {
        signal: abortController.signal,
        onProgress: (progress) => {
          const next = normalizeJobProgress(progress);
          setGeneratingImagesProgress(next);
          if (typeof next.pct === 'number') {
            updateLogProgress(logId, next.pct, next.message ?? undefined);
          }

          // 检测是否有新图片完成，如有则立即刷新场景数据
          const rawProgress = progress as {
            completedImages?: number;
            latestImage?: unknown;
          };
          const latestImage = rawProgress.latestImage;
          if (latestImage && typeof latestImage === 'object' && !Array.isArray(latestImage)) {
            const rawImage = latestImage as Record<string, unknown>;
            const keyframe = rawImage.keyframe;
            const url = typeof rawImage.url === 'string' ? rawImage.url.trim() : '';
            if (isGeneratedImageKeyframe(keyframe) && url) {
              const metadata =
                rawImage.metadata &&
                typeof rawImage.metadata === 'object' &&
                !Array.isArray(rawImage.metadata)
                  ? (rawImage.metadata as Record<string, unknown>)
                  : undefined;
              const mergedImage: NonNullable<Scene['generatedImages']>[number] = {
                keyframe,
                url,
                ...(typeof rawImage.prompt === 'string' ? { prompt: rawImage.prompt } : {}),
                ...(typeof rawImage.revisedPrompt === 'string'
                  ? { revisedPrompt: rawImage.revisedPrompt }
                  : {}),
                ...(typeof rawImage.provider === 'string' ? { provider: rawImage.provider } : {}),
                ...(typeof rawImage.model === 'string' ? { model: rawImage.model } : {}),
                ...(typeof rawImage.createdAt === 'string' ? { createdAt: rawImage.createdAt } : {}),
                ...(metadata ? { metadata } : {}),
              };

              const store = useEpisodeScenesStore.getState();
              store.setScenes(
                store.scenes.map((item) =>
                  item.id === sceneId
                    ? {
                        ...item,
                        generatedImages: mergeGeneratedImages(item.generatedImages, mergedImage),
                      }
                    : item,
                ),
              );
            }
          }

          if (
            typeof rawProgress.completedImages === 'number' &&
            rawProgress.completedImages > lastRefreshedImageCount &&
            currentEpisode?.id
          ) {
            lastRefreshedImageCount = rawProgress.completedImages;
            // 若未携带 latestImage，回退到整集刷新，确保老任务格式仍可见
            if (!rawProgress.latestImage) {
              loadScenes(currentProject.id, currentEpisode.id);
            }
          }
        },
      });

      // 12. 任务完成，更新日志
      const result = (finished.result ?? null) as unknown;
      const tokenUsage = normalizeJobTokenUsage(
        result && typeof result === 'object'
          ? (result as { tokenUsage?: unknown }).tokenUsage
          : null,
      );
      updateLogWithResponse(logId, { content: safeJsonStringify(result), tokenUsage });

      // 13. 刷新场景数据
      if (currentEpisode?.id) {
        loadScenes(currentProject.id, currentEpisode.id);
      }

      // 14. 成功提示
      toast({
        title: keyframeKey ? `${keyframeKey} 图片生成完成` : '图片生成完成',
        description: keyframeKey ? `已生成 ${keyframeKey} 图片。` : '已生成关键帧图片。',
      });
    } catch (error) {
      // 15. 错误处理：区分取消错误和其他错误
      if (isAbortError(error)) {
        updateLogWithCancelled(logId);
        toast({
          title: '已取消',
          description: '关键帧图片生成已取消。',
        });
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        updateLogWithError(logId, detail);
        toast({ title: '图片生成失败', description: detail, variant: 'destructive' });
      }
    } finally {
      // 16. 清理状态
      generatingImagesAbortRef.current = null;
      setGeneratingImagesSceneId(null);
      setGeneratingSingleImageKey(null);
      setGeneratingImagesProgress(null);
    }
  };

  const handleGenerateSingleKeyframeImage = async (
    sceneId: string,
    keyframeKey: GeneratedImageKeyframe,
  ) => {
    await handleGenerateKeyframeImages(sceneId, keyframeKey);
  };

  // 取消关键帧图片生成
  const _cancelGeneratingImages = () => {
    if (generatingImagesAbortRef.current) {
      generatingImagesAbortRef.current.abort();
      toast({ title: '正在取消...', description: '正在停止图片生成任务。' });
    }
  };

  const handleGenerateSceneVideo = async (sceneId: string) => {
    if (!aiProfileId || !currentProject?.id) return;
    setGeneratingVideoSceneId(sceneId);
    try {
      await flushApiEpisodeScenePatchQueue().catch(() => {});
      const job = await apiWorkflowGenerateSceneVideo({
        projectId: currentProject.id,
        sceneId,
        aiProfileId,
      });
      await apiWaitForAIJob(job.id, { timeoutMs: 30 * 60_000 });
      if (currentEpisode?.id) loadScenes(currentProject.id, currentEpisode.id);
      toast({ title: '视频生成完成', description: '已生成视频。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '视频生成失败', description: detail, variant: 'destructive' });
    } finally {
      setGeneratingVideoSceneId(null);
    }
  };

  const runRefineAllScenesJob = async (sceneIds?: string[]) => {
    if (!aiProfileId || !currentProject?.id) {
      throw new Error('缺少 aiProfileId 或 projectId，无法执行全部细化');
    }
    if (isGlobalBatchGenerating && batchGeneratingSource !== 'episode_workflow') {
      toast({
        title: '批量任务进行中',
        description: '当前有其他批量操作正在执行，请等待完成后再细化。',
        variant: 'destructive',
      });
      return;
    }

    // 计算目标分镜数量（用于进度追踪）
    const targetSceneCount = sceneIds?.length ?? sortedScenes.length;
    const targetSceneIds = sceneIds ?? sortedScenes.map((s) => s.id);

    setRefineAllJobRunning(true);
    setRefineAllFailedScenes([]);
    setRefineAllProgress({
      pct: 0,
      message: '准备批量细化...',
      totalScenes: targetSceneCount,
      currentSceneId: null,
      currentSceneOrder: null,
      completedSceneIds: [],
      failedScenes: [],
    });

    // 创建 AITask 用于在开发者面板显示
    const logId = logAICall('scene_refine_all', {
      skillName: 'workflow:refine_all_scenes',
      promptTemplate: 'POST /workflow/projects/{{projectId}}/scenes/refine-all',
      filledPrompt: `POST /workflow/projects/${currentProject.id}/scenes/refine-all`,
      messages: [
        {
          role: 'user',
          content: safeJsonStringify({
            projectId: currentProject.id,
            aiProfileId,
            sceneIds: targetSceneIds,
            totalScenes: targetSceneCount,
            mode: 'batch_backend',
          }),
        },
      ],
      context: {
        systemPromptKeys: [
          'workflow.scene_anchor.system',
          'workflow.action_beats.action_plan.system',
          'workflow.action_beats.keyframe_group.system',
          'workflow.motion_prompt.system',
          'workflow.dialogue.system',
        ],
        projectId: currentProject.id,
        batchMode: 'backend',
        totalScenes: targetSceneCount,
      },
      config: {
        provider: config?.provider ?? 'api',
        model: config?.model ?? 'workflow',
        maxTokens: config?.generationParams?.maxTokens,
        profileId: config?.aiProfileId ?? aiProfileId,
      },
    });

    // 初始化全局批量状态（开发者面板/统计分析可见）
    startBatchGenerating('episode_workflow');
    setBatchSelectedScenes(targetSceneIds);
    updateBatchOperations({
      isProcessing: true,
      isPaused: false,
      cancelRequested: false,
      progress: 0,
      currentScene: 0,
      totalScenes: targetSceneCount,
      operationType: 'generate',
      startTime: Date.now(),
      completedScenes: [],
      failedScenes: [],
      currentSceneId: null,
      statusMessage: '正在启动后端批量细化...',
    });

    try {
      await flushApiEpisodeScenePatchQueue().catch(() => {});
      const job = await apiWorkflowRefineAllScenes({
        projectId: currentProject.id,
        aiProfileId,
        sceneIds,
      });
      const finished = await apiWaitForAIJob(job.id, {
        onProgress: (progress) => {
          const next = normalizeBatchRefineProgress(progress);
          setRefineAllProgress(next);

          // 同步进度到全局 batchOperations（供 DevPanel 显示）
          const completedCount = next.completedSceneIds.length;
          const failedCount = next.failedScenes.length;
          const processedCount = completedCount + failedCount;
          const totalForCalc = next.totalScenes ?? targetSceneCount;
          const overallProgress =
            totalForCalc > 0 ? Math.round((processedCount / totalForCalc) * 100) : 0;

          updateBatchOperations({
            progress: typeof next.pct === 'number' ? next.pct : overallProgress,
            currentScene: processedCount,
            totalScenes: totalForCalc,
            currentSceneId: next.currentSceneId,
            completedScenes: next.completedSceneIds,
            failedScenes: next.failedScenes.map((f) => f.sceneId),
            statusMessage:
              next.message ??
              `正在细化 #${next.currentSceneOrder ?? '?'}（${processedCount + 1}/${totalForCalc}）...`,
          });

          // 同步更新 AITask 进度
          if (typeof next.pct === 'number') {
            updateLogProgress(
              logId,
              next.pct,
              next.message ?? `已完成 ${completedCount}/${totalForCalc} 个分镜`,
            );
          }

          if (next.failedScenes.length > 0) {
            setRefineAllFailedScenes(next.failedScenes);
          }
        },
      });

      const result = (finished.result ?? null) as Record<string, unknown> | null;
      const failedFromResult = Array.isArray(result?.failedScenes)
        ? (result?.failedScenes as BatchFailedScene[])
        : [];
      if (failedFromResult.length > 0) {
        setRefineAllFailedScenes(failedFromResult);
      }

      // 更新最终状态到 batchOperations
      const finalCompleted =
        (result?.completedSceneIds as string[] | undefined) ??
        refineAllProgress?.completedSceneIds ??
        [];
      updateBatchOperations({
        isProcessing: false,
        progress: 100,
        currentScene: targetSceneCount,
        completedScenes: finalCompleted,
        failedScenes: failedFromResult.map((f) => f.sceneId),
        currentSceneId: null,
        statusMessage:
          failedFromResult.length > 0
            ? `批量细化完成（${failedFromResult.length} 个失败）`
            : '批量细化完成',
      });

      // 完成 AITask
      const tokenUsage = normalizeJobTokenUsage(
        result && typeof result === 'object'
          ? (result as { tokenUsage?: unknown }).tokenUsage
          : null,
      );
      updateLogWithResponse(logId, { content: safeJsonStringify(result), tokenUsage });

      if (currentEpisode?.id) loadScenes(currentProject.id, currentEpisode.id);

      toast({
        title: failedFromResult.length > 0 ? '全部细化完成（部分失败）' : '全部细化完成',
        description:
          failedFromResult.length > 0
            ? `失败 ${failedFromResult.length} 个分镜，可点击"重试失败项"继续。`
            : '已更新项目所有分镜内容。',
        variant: failedFromResult.length > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      // 更新失败状态到 batchOperations
      updateBatchOperations({
        isProcessing: false,
        statusMessage: `批量细化失败: ${detail}`,
      });

      // 更新 AITask 失败状态
      updateLogWithError(logId, detail);

      toast({ title: '全部细化失败', description: detail, variant: 'destructive' });
    } finally {
      setRefineAllJobRunning(false);
      stopBatchGenerating();
    }
  };

  const handleRefineAllScenes = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    await runRefineAllScenesJob();
  };

  const handleRetryFailedRefineAll = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    if (refineAllFailedScenes.length === 0) return;
    const retrySceneIds = Array.from(new Set(refineAllFailedScenes.map((scene) => scene.sceneId)));
    await runRefineAllScenesJob(retrySceneIds);
  };

  const handleRetryFailedEpisodeSceneChildTasks = async () => {
    if (!aiProfileId || !currentProject?.id) return;
    if (failedEpisodeSceneChildTaskSceneIds.length === 0) return;
    await runRefineAllScenesJob(failedEpisodeSceneChildTaskSceneIds);
  };

  const requestCancelBatchRefine = () => {
    if (!isBatchRefineRunning) return;
    updateBatchOperations({
      cancelRequested: true,
      statusMessage: '已请求取消（将停止当前分镜细化并取消对应 job）...',
    });
    batchRefineAbortRef.current?.abort();
    toast({ title: '已请求取消', description: '正在停止批量细化...' });
  };

  const startBatchRefine = async (sceneIds: string[]) => {
    if (!aiProfileId || !currentProject?.id || !currentEpisode?.id) return;
    if (isBatchBlocked) {
      toast({
        title: '批量任务进行中',
        description: '当前有其他批量操作正在执行，请等待完成后再启动批量细化。',
        variant: 'destructive',
      });
      return;
    }
    if (isBatchRefineRunning) return;

    const selectedUnique = Array.from(new Set(sceneIds)).filter(Boolean);
    if (selectedUnique.length === 0) {
      toast({ title: '未选择分镜', description: '请至少选择 1 个分镜再开始批量细化。' });
      return;
    }

    // 按 order 串行执行，避免竞态与资源争抢
    const orderById = new Map(sortedScenes.map((s) => [s.id, s.order] as const));
    const sceneById = new Map(sortedScenes.map((s) => [s.id, s] as const));
    const orderedIds = selectedUnique
      .slice()
      .sort(
        (a, b) =>
          (orderById.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (orderById.get(b) ?? Number.MAX_SAFE_INTEGER),
      );

    // 关键：先 flush 编辑队列，避免“用户编辑 patch”与“worker 写回”交叉覆盖
    await flushApiEpisodeScenePatchQueue().catch(() => {});

    const projectId = currentProject.id;
    const episodeId = currentEpisode.id;

    // 初始化全局批量状态（开发者面板/统计分析可见）
    startBatchGenerating('episode_workflow');
    setBatchSelectedScenes(orderedIds);
    updateBatchOperations({
      isProcessing: true,
      isPaused: false,
      cancelRequested: false,
      progress: 0,
      currentScene: 0,
      totalScenes: orderedIds.length,
      operationType: 'generate',
      startTime: Date.now(),
      completedScenes: [],
      failedScenes: [],
      currentSceneId: null,
      statusMessage: '准备开始批量细化...',
    });

    setIsRefining(true);
    setRefiningSceneId(null);
    setRefineJobProgress(null);
    setBatchRefineErrors({});

    const abortController = new AbortController();
    batchRefineAbortRef.current = abortController;

    toast({
      title: '开始批量细化',
      description: `已入队执行（串行）。共 ${orderedIds.length} 个分镜。`,
    });

    let successCount = 0;
    let failCount = 0;
    let cancelled = false;

    try {
      for (let i = 0; i < orderedIds.length; i += 1) {
        const sceneId = orderedIds[i];
        if (abortController.signal.aborted) {
          cancelled = true;
          break;
        }

        const scene = sceneById.get(sceneId);
        if (!scene) {
          failCount += 1;
          addBatchFailedScene(sceneId);
          setBatchRefineErrors((prev) => ({
            ...prev,
            [sceneId]: '分镜不存在（可能已删除或列表已刷新）',
          }));
          continue;
        }

        setRefiningSceneId(sceneId);
        setRefineJobProgress(null);
        updateBatchOperations({
          currentSceneId: sceneId,
          currentScene: i + 1,
          statusMessage: `正在细化 #${scene.order}（${i + 1}/${orderedIds.length}）...`,
          progress: Math.round((i / orderedIds.length) * 100),
        });

        try {
          await runRefineSceneAllJob(sceneId, {
            signal: abortController.signal,
            extraContext: { batchIndex: i + 1, batchTotal: orderedIds.length, batchMode: 'bulk' },
            onProgress: (next) => {
              setRefineJobProgress(next);
              const delta = typeof next.pct === 'number' ? next.pct / 100 : 0;
              const overall = Math.round(((i + delta) / orderedIds.length) * 100);
              updateBatchOperations({
                progress: overall,
                statusMessage: `正在细化 #${scene.order}（${i + 1}/${orderedIds.length}）${
                  next.message ? `：${next.message}` : ''
                }`,
              });
            },
          });

          successCount += 1;
          addBatchCompletedScene(sceneId);
        } catch (error) {
          if (isAbortError(error)) {
            cancelled = true;
            break;
          }
          failCount += 1;
          addBatchFailedScene(sceneId);
          const detail = error instanceof Error ? error.message : String(error);
          setBatchRefineErrors((prev) => ({ ...prev, [sceneId]: detail }));
        }
      }
    } finally {
      batchRefineAbortRef.current = null;
      setIsRefining(false);
      setRefiningSceneId(null);
      setRefineJobProgress(null);

      const finalProgress = useAIProgressStore.getState().batchOperations.progress;
      updateBatchOperations({
        isProcessing: false,
        currentSceneId: null,
        statusMessage: cancelled ? '已取消批量细化' : '批量细化完成',
        progress: cancelled ? finalProgress : 100,
      });
      stopBatchGenerating();

      // 刷新一次当前 episode 的 scenes（避免每个 scene 都 reload，减少抖动/请求）
      loadScenes(projectId, episodeId);
    }

    if (cancelled) {
      toast({
        title: '批量细化已取消',
        description: `已完成 ${successCount} 个，失败 ${failCount} 个。`,
      });
      return;
    }

    toast({
      title: '批量细化完成',
      description: `成功 ${successCount} 个，失败 ${failCount} 个。`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });
  };

  const handleStartBatchRefine = async () => {
    await startBatchRefine(batchRefineSelectedIds);
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
          schema: {
            name: 'aixsss.workflowExport',
            version: 2,
          },
          project: currentProject,
          workflowV2: currentProject.contextCache?.workflowV2 ?? null,
          globalSettings: {
            artStyleFullPrompt: styleFullPrompt,
            worldView: worldViewElements,
            characters: projectCharacters,
            narrativeCausalChain: currentProject.contextCache?.narrativeCausalChain ?? null,
          },
          episodes: episodes.map((ep) => {
            const epScenes = sceneMap.get(ep.id) ?? [];
            const metrics = computeEpisodeMetrics(epScenes);
            const scenesWithMetrics = epScenes.map((s) => ({
              ...s,
              panelMetrics: computePanelMetrics(s),
            }));
            const panels = epScenes.map((s) => ({
              id: s.id,
              order: s.order,
              status: s.status,
              summary: s.summary,
              notes: s.notes,
              dialogues: Array.isArray(s.dialogues) ? (s.dialogues as DialogueLine[]) : [],
              panelMetrics: computePanelMetrics(s),
              panelScript: resolvePanelScript(s),
              promptBlocks: {
                sceneAnchor: parseSceneAnchorText(s.sceneDescription),
                actionPlan: s.actionPlanJson ?? null,
                keyframes: parseKeyframePromptText(s.shotPrompt),
                keyframeGroups: s.keyframeGroupsJson ?? null,
                motion: parseMotionPromptText(s.motionPrompt),
                motionGroups: s.motionGroupsJson ?? null,
              },
              assetManifest: resolvePanelAssetManifest(s, projectCharacters),
              promptLayers: buildPromptLayers({
                project: currentProject,
                episode: ep,
                scene: s,
                styleFullPrompt,
                characters: projectCharacters,
              }),
              finalPrompts: buildFinalPromptPack(s, styleFullPrompt),
            }));
            return {
              ...ep,
              workflowV2: ep.contextCache?.workflowV2 ?? null,
              metrics,
              panels,
              scenes: scenesWithMetrics,
            };
          }),
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
          const metrics = computeEpisodeMetrics(epScenes);
          const minutes = metrics.totalEstimatedSeconds / 60;
          md += `#### 本集节奏估算（粗略）\n\n`;
          md += `- 格数：${metrics.panelCount}\n`;
          md += `- 估算时长：${Number.isFinite(minutes) ? `${minutes.toFixed(1)} 分钟` : '-'}\n`;
          md += `- 平均/格：${metrics.avgSecondsPerPanel}s\n`;
          md += `- 对白字数：${metrics.totalDialogueChars}\n\n`;

          md += `#### 分镜列表（${epScenes.length}）\n\n`;
          if (epScenes.length === 0) {
            md += `- （空）\n\n`;
          } else {
            epScenes
              .slice()
              .sort((a, b) => a.order - b.order)
              .forEach((s) => {
                const panel = computePanelMetrics(s);
                const meta =
                  panel.dialogueCharCount > 0
                    ? `（对白 ${panel.dialogueCharCount} 字 / 气泡 ${panel.dialogueLineCount} / ${panel.estimatedSeconds}s）`
                    : `（${panel.estimatedSeconds}s）`;
                md += `- ${s.order}. ${s.summary} ${meta}\n`;
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

  const _getStepStatus = (step: WorkflowStep): 'completed' | 'current' | 'pending' => {
    if (step === activeStep) return 'current';
    const order: WorkflowStep[] = ['workbench', 'global', 'causal', 'plan', 'episode', 'export'];
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
      toast({
        title: isForce ? `阶段 ${phase} 已重新生成` : `阶段 ${phase} 完成`,
        description: meta.name,
      });
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
    const _validationStatus =
      (narrative as { validationStatus?: string } | null)?.validationStatus ?? 'incomplete';

    return (
      <div className="space-y-6">
        <Card className="border shadow-sm">
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">构建叙事因果链</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    通过四个阶段构建深度一致的叙事逻辑：冲突 → 角色 → 节拍 → 叙事线。
                    <br />
                    这是保证多集剧本逻辑自洽的核心地基。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={summaryLen >= 100 ? 'secondary' : 'destructive'}
                    className="font-normal"
                  >
                    梗概 {summaryLen}/100
                  </Badge>
                  <Badge variant={hasStyle ? 'secondary' : 'destructive'} className="font-normal">
                    画风 {hasStyle ? 'OK' : '缺失'}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    世界观 {worldViewElements.length}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    角色 {projectCharacters.length}
                  </Badge>
                </div>

                {missing.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    <AlertTriangle className="w-4 h-4" />
                    <span>前置条件未满足：{missing.join('、')}</span>
                  </div>
                )}

                {updatedAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    最近更新：{new Date(updatedAt).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>

              <div className="w-full md:w-auto md:min-w-[320px] space-y-4">
                {/* 阶段控制面板 */}
                <div className="bg-muted/30 p-4 rounded-xl border space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    生成流程控制
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {CAUSAL_CHAIN_PHASES.map((p) => {
                      const isCompleted = completedPhase >= p.phase;
                      const isNext = completedPhase === p.phase - 1;
                      const isRunningThisPhase = runningPhase === p.phase;
                      const isAnyPhaseRunning = runningPhase !== null || isRunningWorkflow;
                      const canTrigger = canPlan && !isAnyPhaseRunning;
                      const canRunMain = canTrigger && isNext;
                      const canRerun = canTrigger && isCompleted;

                      return (
                        <div key={p.phase} className="flex items-center gap-2">
                          {/* 主生成按钮 */}
                          <Button
                            onClick={() => void handleCausalPhase(p.phase)}
                            disabled={!canRunMain}
                            variant={isCompleted ? 'secondary' : isNext ? 'default' : 'ghost'}
                            className={cn(
                              'flex-1 justify-start h-9 text-sm font-medium transition-all relative overflow-hidden',
                              isNext && 'shadow-md hover:shadow-lg ring-1 ring-primary/20',
                              !isNext && !isCompleted && 'text-muted-foreground bg-muted/50',
                            )}
                          >
                            <div
                              className={cn(
                                'flex items-center justify-center w-5 h-5 rounded-full mr-2 text-[10px]',
                                isCompleted
                                  ? 'bg-green-500 text-white'
                                  : isNext
                                    ? 'bg-primary-foreground text-primary'
                                    : 'bg-muted-foreground/20',
                              )}
                            >
                              {isRunningThisPhase ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isCompleted ? (
                                '✓'
                              ) : (
                                p.phase
                              )}
                            </div>
                            <span className="truncate">{p.name}</span>
                            {isNext && (
                              <span className="absolute right-3 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                            )}
                          </Button>

                          {/* 重试按钮 */}
                          {isCompleted && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-muted-foreground hover:text-primary"
                              disabled={!canRerun}
                              onClick={() => {
                                setPendingRerunPhase(p.phase);
                                setRerunPhaseDialogOpen(true);
                              }}
                              title="重新生成此阶段"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setNarrativeDialogOpen(true)}
                    disabled={!currentProject?.id}
                    className="flex-1 gap-2 h-9 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    编辑 JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setVersionDialogOpen(true)}
                    disabled={!currentProject?.id}
                    className="flex-1 gap-2 h-9 text-xs"
                  >
                    <History className="w-3.5 h-3.5" />
                    历史版本
                    {typeof chainVersionCount === 'number' && chainVersionCount > 0 && (
                      <span className="bg-muted px-1.5 py-0.5 rounded-full text-[10px]">
                        {chainVersionCount}
                      </span>
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleExpandStoryCharacters}
                  disabled={
                    !isApiMode() ||
                    !aiProfileId ||
                    !currentProject?.id ||
                    !narrative ||
                    isExpandingCharacters
                  }
                  className="w-full gap-2 h-9 text-xs"
                >
                  {isExpandingCharacters ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  丰满角色体系
                </Button>
                <Button
                  variant="default"
                  onClick={() => setActiveStep('plan')}
                  disabled={completedPhase < 1}
                  className="w-full gap-2 h-9 text-xs"
                >
                  下一步：剧集规划
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>

                {isRunningWorkflow && (
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between font-medium text-primary">
                      <span>AI 正在思考...</span>
                      <span>
                        {typeof lastJobProgress?.pct === 'number'
                          ? `${lastJobProgress.pct}%`
                          : '0%'}
                      </span>
                    </div>
                    <Progress
                      value={typeof lastJobProgress?.pct === 'number' ? lastJobProgress.pct : 0}
                      className="h-1.5"
                    />
                    <p className="text-muted-foreground/80 truncate">
                      {lastJobProgress?.message || '正在排队...'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {characterExpansion && (
          <Card className="border shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">角色扩充候选</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    基于叙事因果链与现有设定生成的候选角色，可勾选后导入角色库。
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  生成时间：{new Date(characterExpansion.generatedAt).toLocaleString('zh-CN')}
                </div>
              </div>

              {characterExpansion.candidates.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                  本次未识别到可新增角色（可能都与现有角色重复）。可先继续完善因果链后再重试。
                </div>
              ) : (
                <>
                  <div className="grid gap-3">
                    {characterExpansion.candidates.map((candidate) => {
                      const checked = selectedExpansionCandidates.includes(candidate.tempId);
                      return (
                        <div
                          key={candidate.tempId}
                          className={cn(
                            'rounded-lg border p-3 transition-colors',
                            checked ? 'border-primary/50 bg-primary/5' : 'border-border',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                toggleExpansionCandidate(candidate.tempId, next === true);
                              }}
                              className="mt-0.5"
                            />
                            <div className="space-y-1 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">{candidate.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {candidate.roleType || 'supporting'}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  置信度 {Math.round(candidate.confidence * 100)}%
                                </Badge>
                              </div>
                              {candidate.briefDescription && (
                                <p className="text-sm text-muted-foreground">
                                  {candidate.briefDescription}
                                </p>
                              )}
                              {candidate.evidence.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  证据：{candidate.evidence.slice(0, 2).join('；')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      候选 {characterExpansion.candidates.length} 个，已选{' '}
                      {selectedExpansionCandidates.length} 个
                      {characterExpansion.stats ? (
                        <>
                          {' '}
                          · 去重 {characterExpansion.stats.duplicatesResolved ?? 0} · 跳过已有{' '}
                          {characterExpansion.stats.existingSkipped ?? 0}
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedExpansionCandidates(
                            characterExpansion.candidates.map((candidate) => candidate.tempId),
                          );
                        }}
                      >
                        全选
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedExpansionCandidates([])}
                      >
                        清空
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleImportExpandedCharacters}
                        disabled={selectedExpansionCandidates.length === 0}
                      >
                        导入选中角色
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {narrative ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <NarrativeCausalChainReadable value={narrative} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-muted/10 text-muted-foreground text-center">
            <div className="bg-background p-4 rounded-full shadow-sm mb-4">
              <Network className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">暂无因果链数据</h3>
            <p className="text-sm max-w-sm mx-auto">
              请点击右上角的控制面板，按顺序生成叙事因果链的各个阶段。
            </p>
          </div>
        )}
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

    const canRunPlan = canPlan && hasCausalChain;

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Section: Context & Controls */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-6 bg-gradient-to-br from-card to-muted/30">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">剧集规划中心</h2>
                <p className="text-muted-foreground leading-relaxed">
                  基于全局设定与因果链，智能规划剧集结构。支持自动推荐集数，或按需指定。
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    故事梗概
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        summaryLen >= 100 ? 'bg-emerald-500' : 'bg-destructive',
                      )}
                    />
                    <span className="font-semibold">{summaryLen} 字</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    画风设定
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        hasStyle ? 'bg-emerald-500' : 'bg-destructive',
                      )}
                    />
                    <span className="font-semibold">{hasStyle ? '已配置' : '缺失'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    因果链
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        hasCausalChain ? 'bg-emerald-500' : 'bg-destructive',
                      )}
                    />
                    <span className="font-semibold">{hasCausalChain ? '已生成' : '缺失'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    AI Profile
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        aiProfileId ? 'bg-emerald-500' : 'bg-destructive',
                      )}
                    />
                    <span className="font-semibold">{aiProfileId ? 'Ready' : '未选择'}</span>
                  </div>
                </div>
              </div>

              {missing.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>前置条件未满足：{missing.join('、')}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 flex flex-col justify-center space-y-4 border-l-4 border-l-primary/20">
            <div className="space-y-2">
              <Label htmlFor="targetEpisodeCount" className="text-sm font-medium">
                规划设置
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="targetEpisodeCount"
                  type="number"
                  min={1}
                  max={100}
                  value={targetEpisodeCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setTargetEpisodeCount('');
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isFinite(n)) {
                      setTargetEpisodeCount('');
                      return;
                    }
                    setTargetEpisodeCount(Math.max(1, Math.min(100, Math.round(n))));
                  }}
                  placeholder="自动推荐集数"
                  className="bg-background"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">集</span>
              </div>
              <p className="text-xs text-muted-foreground">
                支持 1-100 集；留空则由 AI 根据故事体量自动推算。
              </p>
            </div>

            <Button
              onClick={handlePlanEpisodes}
              disabled={!canRunPlan || isRunningWorkflow}
              size="lg"
              className="w-full shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
            >
              {isRunningWorkflow ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-5 w-5 mr-2" />
              )}
              {episodes.length > 0 ? '重新规划 (覆盖)' : '开始规划剧集'}
            </Button>

            {isRunningWorkflow && (
              <div className="space-y-1.5">
                <Progress
                  value={typeof lastJobProgress?.pct === 'number' ? lastJobProgress.pct : 0}
                  className="h-2"
                />
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  {lastJobProgress?.message || '正在分析故事结构...'}
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Episodes Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              剧集列表
              <Badge variant="secondary" className="ml-2 rounded-full px-2.5">
                {episodes.length} 集
              </Badge>
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => currentProject?.id && loadEpisodes(currentProject.id)}
                disabled={isEpisodesLoading}
                className={cn('text-muted-foreground', isEpisodesLoading && 'animate-spin')}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openCreateEpisodeDialog}
                disabled={!currentProject?.id || isRunningWorkflow}
              >
                <Plus className="h-4 w-4 mr-1" /> 手动新增
              </Button>
            </div>
          </div>

          <Separator />

          {episodeError && (
            <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {episodeError}
            </div>
          )}

          {episodes.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed rounded-xl bg-muted/10">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <LayoutGrid className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium text-muted-foreground">暂无剧集规划</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                请点击上方「开始规划剧集」，AI 将为您自动生成分集大纲。
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {episodes.map((ep) => (
                <Card
                  key={ep.id}
                  className="group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/50 flex flex-col"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div className="flex gap-1 bg-background/80 backdrop-blur rounded-md p-1 shadow-sm border">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEpisodeEditor(ep)}
                        title="编辑属性"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => openDeleteEpisodeConfirm(ep)}
                        disabled={isRunningWorkflow}
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <CardHeader className="pb-3 relative">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-4xl font-bold text-muted-foreground/10 select-none absolute -top-2 -left-2">
                          {String(ep.order).padStart(2, '0')}
                        </span>
                        <Badge variant="outline" className="bg-background relative z-0">
                          第 {ep.order} 集
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] px-1.5 py-0 h-5',
                            ep.workflowState === 'COMPLETE'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : '',
                          )}
                        >
                          {getEpisodeStateLabel(ep.workflowState)}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-lg leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {ep.title || '（未命名）'}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="flex-1 pb-4">
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed mb-4 min-h-[4.5em]">
                      {ep.summary || '暂无概要...'}
                    </p>

                    {/* Metrics / Status (Placeholder for now) */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
                      <div className="flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        <span>- 分镜</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span>- 对白</span>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 pt-0 mt-auto">
                    <Button
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      variant="secondary"
                      onClick={() => {
                        setCurrentEpisode(ep.id);
                        setActiveStep('episode');
                      }}
                    >
                      进入创作{' '}
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEpisodeStep = () => {
    const hasEpisode = Boolean(currentEpisode?.id);
    const hasCoreExpression = Boolean(currentEpisode?.coreExpression);
    const canGenerateSceneList = Boolean(hasEpisode && hasCoreExpression && aiProfileId);

    // 计算分镜统计（不使用 useMemo，因为 hooks 不能在嵌套函数中调用）
    const total = scenes.length;
    const completed = scenes.filter((s) => s.status === 'completed').length;
    const scenesStats = {
      total,
      completed,
      progress: total > 0 ? (completed / total) * 100 : 0,
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md border-l-4 border-l-primary bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="bg-primary/10 p-2 rounded-full">
              <Clapperboard className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold whitespace-nowrap">单集创作</h2>
                {currentEpisode && (
                  <Badge variant="outline" className="ml-2">
                    {getEpisodeStateLabel(currentEpisode.workflowState)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 w-full flex-wrap">
                <div className="flex items-center gap-2 w-full sm:max-w-[320px]">
                  <select
                    id="episodeSelect"
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={currentEpisodeId ?? ''}
                    onChange={(e) => setCurrentEpisode(e.target.value || null)}
                    disabled={
                      isRunningWorkflow || isRefining || isBatchBlocked || isBatchRefineRunning
                    }
                  >
                    <option value="">-- 选择集数 --</option>
                    {episodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        第 {ep.order} 集：{ep.title || '(未命名)'}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateCoreExpressionBatch}
                  disabled={
                    !aiProfileId ||
                    episodes.length === 0 ||
                    isRunningWorkflow ||
                    isRefining ||
                    isBatchBlocked ||
                    isBatchRefineRunning
                  }
                  className="gap-2 w-full sm:w-auto"
                  title="一键为未生成的 Episode 批量生成核心表达"
                >
                  {isRunningWorkflow ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Layers className="h-4 w-4" />
                  )}
                  批量核心表达
                </Button>
                <Button
                  size="sm"
                  onClick={handleRunEpisodeCreationAgent}
                  disabled={
                    !aiProfileId ||
                    !currentEpisode?.id ||
                    isRunningEpisodeCreationAgent ||
                    isRunningWorkflow ||
                    isRefining ||
                    isBatchBlocked ||
                    isBatchRefineRunning
                  }
                  className="gap-2 w-full sm:w-auto"
                  title="按核心表达→分场脚本→分镜列表→分镜细化→声音与时长顺序逐步生成"
                >
                  {isRunningEpisodeCreationAgent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  AI代理一键生成5步
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleCancelEpisodeCreationAgent();
                  }}
                  disabled={!isRunningEpisodeCreationAgent && !episodeCreationRunningJobId}
                  className="gap-2 w-full sm:w-auto"
                  title="取消当前单集创作 Agent 任务"
                >
                  取消当前任务
                </Button>
              </div>
            </div>
          </div>

          {currentEpisode && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground hidden md:flex">
              <div className="flex flex-col items-center px-4 border-r">
                <span className="font-bold text-foreground">{scenesStats.total}</span>
                <span className="text-[10px] uppercase">分镜</span>
              </div>
              <div className="flex flex-col items-center px-4 border-r">
                <span className="font-bold text-foreground">{scenesStats.completed}</span>
                <span className="text-[10px] uppercase">完成</span>
              </div>
              <div className="w-24">
                <Progress value={scenesStats.progress} className="h-2" />
              </div>
            </div>
          )}
        </Card>

        {!hasEpisode ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl bg-muted/5">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <ArrowRight className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground">请选择或创建一个 Episode</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">
              从上方下拉菜单选择，或返回「剧集规划」页面。
            </p>
          </div>
        ) : (
          <>
            {(isRunningEpisodeCreationAgent || episodeCreationRunSummary) && (
              <Card className="p-4 border-primary/20 bg-primary/5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      单集创作 Agent 状态
                    </h3>
                    {isRunningEpisodeCreationAgent ? (
                      <Badge variant="secondary">运行中</Badge>
                    ) : (
                      <Badge variant="outline">已完成</Badge>
                    )}
                  </div>
                  {episodeCreationRunSummary ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        执行模式：
                        {episodeCreationRunSummary.executionMode === 'agent' ? 'Agent' : 'Legacy'}
                      </span>
                      <span>自动降级：{episodeCreationRunSummary.fallbackUsed ? '是' : '否'}</span>
                      <span>
                        完成时间：
                        {new Date(episodeCreationRunSummary.finishedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  ) : null}
                  {episodeCreationRunSummary?.stepSummaries?.length ? (
                    <div className="space-y-2">
                      {episodeCreationRunSummary.stepSummaries.map((step, idx) => (
                        <div
                          key={`${step.step}_${idx}`}
                          className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm">
                              {EPISODE_AGENT_STEP_LABELS[step.step] ?? step.step}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {step.message}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            {typeof step.chunk === 'number' ? (
                              <Badge variant="outline">分片 #{step.chunk}</Badge>
                            ) : null}
                            {step.executionMode ? (
                              <Badge variant="outline">
                                {step.executionMode === 'agent' ? 'agent' : 'legacy'}
                              </Badge>
                            ) : null}
                            {step.fallbackUsed ? <Badge variant="secondary">fallback</Badge> : null}
                            <Badge
                              variant={
                                step.status === 'succeeded'
                                  ? 'default'
                                  : step.status === 'skipped'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {step.status === 'succeeded'
                                ? '成功'
                                : step.status === 'skipped'
                                  ? '跳过'
                                  : '失败'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {displayedSceneChildTasks.length ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">分镜子任务</div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            void handleRetryFailedEpisodeSceneChildTasks();
                          }}
                          disabled={!canRetryFailedEpisodeSceneChildren}
                        >
                          重试失败分镜 ({failedEpisodeSceneChildTaskSceneIds.length})
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">总计 {displayedSceneChildTaskStats.total}</Badge>
                        <Badge variant="outline">排队 {displayedSceneChildTaskStats.queued}</Badge>
                        <Badge variant="outline">
                          执行中 {displayedSceneChildTaskStats.running}
                        </Badge>
                        <Badge variant="outline">
                          成功 {displayedSceneChildTaskStats.succeeded}
                        </Badge>
                        <Badge variant="outline">失败 {displayedSceneChildTaskStats.failed}</Badge>
                        <Badge variant="outline">
                          取消 {displayedSceneChildTaskStats.cancelled}
                        </Badge>
                        {displayedSceneChildTaskStats.unknown > 0 ? (
                          <Badge variant="outline">
                            未知 {displayedSceneChildTaskStats.unknown}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="space-y-2 max-h-48 overflow-auto pr-1">
                        {displayedSceneChildTasks.map((task) => (
                          <div
                            key={`${task.sceneId}:${task.jobId}`}
                            className="rounded-md border bg-background px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 text-sm truncate">
                                分镜 #{task.order} · {task.jobId}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                {typeof task.chunk === 'number' ? (
                                  <Badge variant="outline">分片 #{task.chunk}</Badge>
                                ) : null}
                                <Badge
                                  variant={
                                    task.status === 'succeeded'
                                      ? 'default'
                                      : task.status === 'queued' || task.status === 'running'
                                        ? 'secondary'
                                        : task.status === 'cancelled'
                                          ? 'outline'
                                          : 'destructive'
                                  }
                                >
                                  {getSceneChildTaskStatusLabel(task.status)}
                                </Badge>
                              </div>
                            </div>
                            {task.error ? (
                              <div className="mt-1 text-xs text-destructive truncate">
                                {task.error}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            )}
            <Tabs defaultValue="core" className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-6">
                <TabsTrigger value="core">1. 核心表达</TabsTrigger>
                <TabsTrigger value="script">2. 分场脚本</TabsTrigger>
                <TabsTrigger value="scenes">3. 分镜列表</TabsTrigger>
                <TabsTrigger value="refine">4. 分镜细化</TabsTrigger>
                <TabsTrigger value="sound">5. 声音与时长</TabsTrigger>
              </TabsList>

              <TabsContent value="core" className="space-y-4 focus-visible:outline-none">
                <Card className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Brain className="w-5 h-5 text-primary" />
                        核心表达 (Core Expression)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        定义本集的主题/情绪曲线与核心冲突，是生成分镜的灵魂。
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGenerateCoreExpression}
                        disabled={!aiProfileId || isRunningWorkflow}
                        className="gap-2 shadow-sm"
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

                  <div className="bg-muted/30 rounded-lg border p-4 min-h-[200px]">
                    {currentEpisode?.coreExpression ? (
                      <JsonViewer value={currentEpisode.coreExpression} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground">
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                          <Brain className="w-6 h-6 opacity-20" />
                        </div>
                        <p>尚未生成核心表达。</p>
                        <p className="text-xs mt-1">请点击右上角「AI 生成」或手动编辑。</p>
                      </div>
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="script" className="space-y-4 focus-visible:outline-none">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary" />
                          分场脚本 (Scene Script)
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          从核心表达扩写为可编辑分场脚本，作为分镜列表前置层。
                        </p>
                      </div>
                      <Button
                        onClick={handleGenerateSceneScript}
                        disabled={!aiProfileId || isGeneratingSceneScript}
                        className="gap-2"
                      >
                        {isGeneratingSceneScript ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        AI 生成
                      </Button>
                    </div>
                    <SceneScriptEditor
                      value={(currentEpisode?.sceneScriptDraft as SceneScriptBlock[] | null) ?? []}
                      onSave={handleSaveSceneScriptDraft}
                      disabled={!currentEpisode}
                    />
                  </Card>

                  <Card className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Brain className="w-5 h-5 text-primary" />
                          情绪弧线 (Emotion Arc)
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          生成项目级情绪弧，辅助节奏与冲突强度把控。
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleGenerateEmotionArc}
                        disabled={!aiProfileId || isGeneratingEmotionArc}
                      >
                        {isGeneratingEmotionArc ? '生成中...' : 'AI 生成'}
                      </Button>
                    </div>
                    <EmotionArcChart points={emotionArc as EmotionArcPoint[]} />
                  </Card>
                </div>

                <Card className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Network className="w-5 h-5 text-primary" />
                        角色关系图谱 (Character Relationships)
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        关系表为主存，图谱用于辅助检查角色冲突与协作关系。
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleGenerateCharacterRelationships}
                      disabled={!aiProfileId || isGeneratingRelationships}
                    >
                      {isGeneratingRelationships ? '生成中...' : 'AI 生成'}
                    </Button>
                  </div>
                  <CharacterRelationshipGraph
                    characters={projectCharacters}
                    relationships={characterRelationships}
                  />
                </Card>
              </TabsContent>

              <TabsContent value="scenes" className="space-y-4 focus-visible:outline-none">
                <Card className="p-6">
                  <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        分镜列表 (Storyboard)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        生成 8-12 条分镜节点，覆盖本集的起承转合。
                      </p>
                    </div>
                    <div className="w-full md:w-auto flex flex-col gap-3 min-w-[300px]">
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={6}
                          max={24}
                          value={sceneCountHint}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSceneCountHint(v ? Number(v) : '');
                          }}
                          placeholder="数量 (默认12)"
                          className="w-32"
                        />
                        <Button
                          onClick={handleGenerateSceneList}
                          disabled={!canGenerateSceneList || isRunningWorkflow}
                          className="flex-1 gap-2 shadow-sm"
                        >
                          {isRunningWorkflow ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          <span>AI 生成列表</span>
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            currentEpisode?.id &&
                            currentProject?.id &&
                            loadScenes(currentProject.id, currentEpisode.id)
                          }
                          disabled={!currentEpisode?.id || isScenesLoading}
                          className="flex-1"
                        >
                          <RefreshCw className="h-3 w-3 mr-2" />
                          刷新
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSortDialogOpen(true)}
                          disabled={scenes.length < 2}
                          className="flex-1"
                        >
                          <ArrowRight className="h-3 w-3 mr-2 rotate-90" />
                          排序
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator className="mb-6" />

                  {scenesError ? (
                    <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2 mb-4">
                      <AlertCircle className="w-4 h-4" />
                      {scenesError}
                    </div>
                  ) : null}

                  {isScenesLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                      <span>正在加载分镜数据...</span>
                    </div>
                  ) : scenes.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      暂无分镜数据，请先生成。
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                      {scenes
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((scene) => (
                          <div
                            key={scene.id}
                            className="group flex flex-col md:flex-row items-start gap-4 rounded-lg border p-4 transition-all hover:bg-muted/30 hover:border-primary/30"
                          >
                            <div className="flex items-center gap-3 md:min-w-[120px]">
                              <Badge
                                variant="outline"
                                className="h-6 w-6 rounded-full flex items-center justify-center p-0 border-primary/50 text-primary"
                              >
                                {scene.order}
                              </Badge>
                              {(() => {
                                const statusStyle = getSceneStatusStyle(scene.status);
                                return (
                                  <Badge
                                    variant="secondary"
                                    className={cn('text-[10px] px-1.5', statusStyle.className)}
                                  >
                                    {statusStyle.label}
                                  </Badge>
                                );
                              })()}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-relaxed text-foreground/90">
                                {scene.summary}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRefineDialogOpen(true);
                                  setSelectedSceneId(scene.id);
                                }}
                              >
                                详情
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="refine" className="space-y-4 focus-visible:outline-none">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        分镜细化 (Refinement)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        针对每个分镜，生成具体的画面描述、镜头语言与对白。
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => void handleRefineAllScenes()}
                        className="gap-2"
                        disabled={!aiProfileId || refineAllJobRunning || isBatchBlocked}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{refineAllJobRunning ? '全部细化中' : '全部细化'}</span>
                      </Button>
                      {refineAllFailedScenes.length > 0 ? (
                        <Button
                          variant="outline"
                          onClick={() => void handleRetryFailedRefineAll()}
                          disabled={refineAllJobRunning || isBatchBlocked}
                        >
                          重试失败项 ({refineAllFailedScenes.length})
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => setBatchRefineDialogOpen(true)}
                        className="gap-2"
                      >
                        <Layers className="w-4 h-4" />
                        批量任务面板
                      </Button>
                    </div>
                  </div>

                  {refineAllProgress ? (
                    <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {refineAllProgress.message || '全部细化进行中...'}
                        </span>
                        <span>
                          {refineAllProgress.totalScenes
                            ? `${Math.min(refineAllProgress.completedSceneIds.length + refineAllProgress.failedScenes.length, refineAllProgress.totalScenes)}/${refineAllProgress.totalScenes}`
                            : '-'}
                        </span>
                      </div>
                      <Progress
                        value={
                          typeof refineAllProgress.pct === 'number' ? refineAllProgress.pct : 0
                        }
                      />
                      {refineAllFailedScenes.length > 0 ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
                          <div className="font-medium">失败列表</div>
                          <div className="space-y-1 max-h-40 overflow-auto pr-1">
                            {refineAllFailedScenes.map((scene) => {
                              const sceneMeta = scenes.find((item) => item.id === scene.sceneId);
                              const orderLabel = scene.order ?? sceneMeta?.order;
                              return (
                                <div key={scene.sceneId} className="flex flex-col gap-0.5">
                                  <span>
                                    {orderLabel ? `#${orderLabel}` : '分镜'}{' '}
                                    {sceneMeta?.summary || scene.sceneId}
                                  </span>
                                  {scene.error ? <span>原因：{scene.error}</span> : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {scenes.length === 0 ? (
                      <div className="col-span-full text-center py-10 text-muted-foreground">
                        暂无分镜，请先生成分镜列表。
                      </div>
                    ) : (
                      scenes
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((scene) => (
                          <div
                            key={scene.id}
                            className={cn(
                              'relative rounded-lg border p-4 transition-all hover:shadow-md hover:border-primary/50 flex flex-col gap-3',
                              scene.status === 'completed'
                                ? 'bg-emerald-50/30 dark:bg-emerald-900/10'
                                : 'bg-card',
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">#{scene.order}</Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  {getSceneStatusLabel(scene.status)}
                                </Badge>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  setRefineDialogOpen(true);
                                  setSelectedSceneId(scene.id);
                                }}
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>

                            <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3em]">
                              {scene.summary}
                            </p>

                            <div className="pt-2 mt-auto">
                              <Button
                                size="sm"
                                variant={scene.status === 'completed' ? 'outline' : 'default'}
                                className="w-full gap-2"
                                onClick={() => handleRefineSceneAll(scene.id)}
                                disabled={!aiProfileId || isRefining || isBatchBlocked}
                              >
                                {isRefining && refiningSceneId === scene.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                <span>
                                  {scene.status === 'completed' ? '重新细化' : '一键细化'}
                                </span>
                              </Button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="sound" className="space-y-4 focus-visible:outline-none">
                <Card className="p-6 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-primary" />
                      声音与时长 (Sound & Duration)
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      对单个分镜执行声音设计与时长估算，可与细化流程并行补齐。
                    </p>
                  </div>
                  {scenes.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      暂无分镜，请先完成分镜列表生成。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scenes
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((scene) => (
                          <div key={scene.id} className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">#{scene.order}</Badge>
                                <span className="text-sm">{scene.summary}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleGenerateSoundDesign(scene.id)}
                                  disabled={!aiProfileId || isGeneratingSoundSceneId === scene.id}
                                >
                                  {isGeneratingSoundSceneId === scene.id
                                    ? '声音生成中...'
                                    : '生成声音'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEstimateDuration(scene.id)}
                                  disabled={
                                    !aiProfileId || isEstimatingDurationSceneId === scene.id
                                  }
                                >
                                  {isEstimatingDurationSceneId === scene.id
                                    ? '估算中...'
                                    : '估算时长'}
                                </Button>
                              </div>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <SoundDesignPanel scene={scene} />
                              <DurationEstimateBar scene={scene} />
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
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

  const refinePrevScene = useMemo(() => {
    if (!refineScene) return null;
    const prevOrder = refineScene.order - 1;
    if (prevOrder <= 0) return null;
    return scenes.find((s) => s.order === prevOrder) ?? null;
  }, [refineScene, scenes]);

  const _refineDeltaItems = useMemo(() => {
    if (!refineScene || !refinePrevScene) return [];

    const formatValue = (value: string | undefined) => (value?.trim() ? value.trim() : '（空）');
    const formatLoc = (ps: ReturnType<typeof resolvePanelScript>) =>
      ps.location?.label?.trim() || ps.location?.worldViewElementId?.trim() || '';

    const prevPS = resolvePanelScript(refinePrevScene);
    const currPS = resolvePanelScript(refineScene);

    const items: Array<{ label: string; before: string; after: string }> = [];

    const prevLoc = formatLoc(prevPS);
    const currLoc = formatLoc(currPS);
    if (prevLoc !== currLoc) {
      items.push({ label: '地点', before: formatValue(prevLoc), after: formatValue(currLoc) });
    }

    const prevTime = prevPS.timeOfDay?.trim() || '';
    const currTime = currPS.timeOfDay?.trim() || '';
    if (prevTime !== currTime) {
      items.push({
        label: '时间/天气',
        before: formatValue(prevTime),
        after: formatValue(currTime),
      });
    }

    const prevCamera = prevPS.camera?.trim() || '';
    const currCamera = currPS.camera?.trim() || '';
    if (prevCamera !== currCamera) {
      items.push({
        label: '镜头',
        before: formatValue(prevCamera),
        after: formatValue(currCamera),
      });
    }

    const prevBlocking = prevPS.blocking?.trim() || '';
    const currBlocking = currPS.blocking?.trim() || '';
    if (prevBlocking !== currBlocking) {
      items.push({
        label: '站位/视线',
        before: formatValue(prevBlocking),
        after: formatValue(currBlocking),
      });
    }

    const prevBubble = prevPS.bubbleLayoutNotes?.trim() || '';
    const currBubble = currPS.bubbleLayoutNotes?.trim() || '';
    if (prevBubble !== currBubble) {
      items.push({
        label: '气泡/版面',
        before: formatValue(prevBubble),
        after: formatValue(currBubble),
      });
    }

    const nameById = new Map(projectCharacters.map((c) => [c.id, c.name] as const));
    const formatIds = (ids: string[]) =>
      ids
        .map((id) => nameById.get(id) ?? id)
        .filter(Boolean)
        .join('、') || '（空）';

    const prevChars = prevPS.charactersPresentIds ?? [];
    const currChars = currPS.charactersPresentIds ?? [];
    if (prevChars.join(',') !== currChars.join(',')) {
      items.push({ label: '出场角色', before: formatIds(prevChars), after: formatIds(currChars) });
    }

    const prevProps = prevPS.props ?? [];
    const currProps = currPS.props ?? [];
    if (prevProps.join(',') !== currProps.join(',')) {
      items.push({
        label: '关键道具',
        before: prevProps.join('、') || '（空）',
        after: currProps.join('、') || '（空）',
      });
    }

    const prevAssets = resolvePanelAssetManifest(refinePrevScene, projectCharacters);
    const currAssets = resolvePanelAssetManifest(refineScene, projectCharacters);
    if (prevAssets.sceneRefs.length !== currAssets.sceneRefs.length) {
      items.push({
        label: '场景参考图',
        before: `${prevAssets.sceneRefs.length} 张`,
        after: `${currAssets.sceneRefs.length} 张`,
      });
    }
    const countMissingCharRefs = (m: typeof currAssets, ids: string[]) =>
      ids.filter((id) => {
        const resolved = m.characters.find((c) => c.characterId === id);
        return !resolved || resolved.source === 'none' || resolved.imageRefs.length === 0;
      }).length;
    const prevMissing = countMissingCharRefs(prevAssets, prevPS.charactersPresentIds ?? []);
    const currMissing = countMissingCharRefs(currAssets, currPS.charactersPresentIds ?? []);
    if (prevMissing !== currMissing) {
      items.push({
        label: '缺角色参考图',
        before: `${prevMissing} 个`,
        after: `${currMissing} 个`,
      });
    }

    return items;
  }, [projectCharacters, refinePrevScene, refineScene]);

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

  // 场景锚点复制文本：使用新的 JSON 拼接工具函数
  const refineSceneAnchorCopyText = useMemo(() => {
    if (!refineScene) return { zh: '', en: '' };
    return buildSceneAnchorCopyText(refineScene);
  }, [refineScene]);

  // 关键帧复制文本：使用新的 JSON 拼接工具函数
  const refineKeyframeCopyTexts = useMemo(() => {
    const empty = Object.fromEntries(
      GENERATED_IMAGE_KEYFRAMES.map((kf) => [kf, { zh: '', en: '' }] as const),
    ) as Record<string, { zh: string; en: string }>;

    if (!refineScene) return empty;

    return Object.fromEntries(
      GENERATED_IMAGE_KEYFRAMES.map((kf) => [kf, buildKeyframeCopyText(refineScene, kf)] as const),
    ) as Record<string, { zh: string; en: string }>;
  }, [refineScene]);

  // 运动提示词复制文本：使用新的 JSON 拼接工具函数
  const refineMotionCopyText = useMemo(() => {
    if (!refineScene) return { zh: '', en: '' };
    return buildMotionCopyText(refineScene);
  }, [refineScene]);

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

  const handleCopyImg2ImgPack = async () => {
    if (!currentProject || !currentEpisode || !refineScene) {
      toast({
        title: '无法复制',
        description: '请先选择一个分镜。',
        variant: 'destructive',
      });
      return;
    }
    const text = buildImg2ImgPackCopyText({
      project: currentProject,
      episode: currentEpisode,
      scene: refineScene,
      styleFullPrompt,
      characters: projectCharacters,
    });
    await copyToClipboard(
      text,
      '已复制',
      '图生图/I2V Prompt Pack 已复制（含输入图片清单与分层差量）。',
    );
  };

  // 关键帧复制处理：使用拼接后的提示词
  const handleCopyKeyframe = async (kfKey: string, locale: 'zh' | 'en') => {
    const idx = GENERATED_IMAGE_KEYFRAMES.indexOf(
      kfKey as (typeof GENERATED_IMAGE_KEYFRAMES)[number],
    );
    const segment = idx >= 0 ? Math.floor(idx / 3) + 1 : 0;
    const phase = idx >= 0 ? (['起', '中', '终'][idx % 3] ?? '') : '';
    const label = idx >= 0 ? `${kfKey}（段${segment}${phase}）` : kfKey;
    const text = refineKeyframeCopyTexts[kfKey]?.[locale] || '';
    await copyToClipboard(
      text,
      '已复制',
      `${label} ${locale.toUpperCase()} 已复制（完整提示词）。`,
    );
  };

  const handleCopyKeyframeAvoid = async (locale: 'zh' | 'en') => {
    const text = parsedRefineKeyframes.avoid?.[locale] || '';
    await copyToClipboard(text, '已复制', `AVOID ${locale.toUpperCase()} 已复制。`);
  };

  // 运动提示词复制处理：支持分块复制和完整复制
  const handleCopyMotion = async (
    block: 'motionShort' | 'motionBeats' | 'constraints' | 'full',
    locale: 'zh' | 'en',
  ) => {
    const labels: Record<string, string> = {
      motionShort: '运动简述',
      motionBeats: '时间节拍',
      constraints: '约束条件',
      full: '完整运动提示词',
    };

    // 完整复制使用拼接后的提示词
    if (block === 'full') {
      const text = refineMotionCopyText[locale] || '';
      await copyToClipboard(text, '已复制', `${labels[block]} ${locale.toUpperCase()} 已复制。`);
      return;
    }

    // 分块复制
    const text = parsedRefineMotion[block][locale] || '';
    await copyToClipboard(text, '已复制', `${labels[block]} ${locale.toUpperCase()} 已复制。`);
  };

  if (!currentProject) return null;
  const workflowLabel = getWorkflowStateLabel(currentProject.workflowState);

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

      <WorkflowStepper currentStep={activeStep} onStepClick={setActiveStep} />

      <div className="min-h-[calc(100vh-260px)]">
        <div className="space-y-6">
          {activeStep === 'workbench' && (
            <WorkflowWorkbench
              project={currentProject}
              styleFullPrompt={styleFullPrompt}
              characters={projectCharacters}
              worldViewElements={worldViewElements}
              episodes={episodes}
              currentEpisode={currentEpisode}
              currentEpisodeScenes={sortedScenes}
              aiProfileId={aiProfileId}
              onGoToStep={setActiveStep}
              onGoToScene={(episodeId, sceneId) => {
                setCurrentEpisode(episodeId);
                setActiveStep('episode');
                setSelectedSceneId(sceneId);
                setRefineDialogOpen(true);
              }}
              onRunPlanEpisodes={handlePlanEpisodes}
              onRunGenerateCoreExpression={handleGenerateCoreExpression}
              onRunGenerateSceneScript={handleGenerateSceneScript}
              onRunGenerateSceneList={handleGenerateSceneList}
              isRunningWorkflowSupervisor={isRunningWorkflowSupervisor}
              agentRunSummary={supervisorRunSummary}
              onRunWorkflowSupervisor={
                isRunningWorkflowSupervisor ? undefined : handleRunWorkflowSupervisor
              }
              onRunGenerateEmotionArc={handleGenerateEmotionArc}
              onRunGenerateCharacterRelationships={handleGenerateCharacterRelationships}
              onRunBatchRefineAll={() => startBatchRefine(recommendedBatchRefineIds)}
              onSetProjectArtifactStatus={handleSetProjectArtifactStatus}
              onSetEpisodeArtifactStatus={handleSetEpisodeArtifactStatus}
            />
          )}
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
        open={batchRefineDialogOpen}
        onOpenChange={(open) => {
          if (!open && isBatchRefineRunning && !batchRefineAllowCloseRef.current) {
            toast({
              title: '批量细化进行中',
              description: '如需关闭窗口请选择「后台运行」，如需停止请点击「取消批量」。',
            });
            return;
          }
          batchRefineAllowCloseRef.current = false;
          setBatchRefineDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>批量细化</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              选择需要批量执行「一键细化」的分镜。将按分镜顺序串行执行，以降低竞态与资源争抢风险。
            </div>

            {isBatchBlocked ? (
              <div className="rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
                当前有其他批量任务正在执行，已暂时禁用启动。你仍可查看列表。
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={setBatchSelectRecommended}
                  disabled={isBatchRefineRunning}
                >
                  仅选未完成
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={setBatchSelectAll}
                  disabled={isBatchRefineRunning}
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={setBatchSelectNone}
                  disabled={isBatchRefineRunning}
                >
                  清空
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                已选 {batchRefineSelectedIds.length}/{sortedScenes.length}
              </div>
            </div>

            <ScrollArea className="h-[360px] rounded-md border">
              <div className="p-3 space-y-2">
                {sortedScenes.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    暂无分镜，请先生成分镜列表。
                  </div>
                ) : (
                  sortedScenes.map((scene) => {
                    const checked = batchRefineSelectedSet.has(scene.id);
                    const isCurrent =
                      isBatchRefineRunning && batchOperations.currentSceneId === scene.id;
                    const isDone = batchCompletedSet.has(scene.id);
                    const isFail = batchFailedSet.has(scene.id);
                    const err = batchRefineErrors[scene.id] ?? null;

                    return (
                      <label
                        key={scene.id}
                        className={`flex items-start gap-3 rounded-md border p-3 hover:bg-muted/30 ${
                          isCurrent ? 'border-primary/50 bg-primary/5' : ''
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleBatchSelect(scene.id, Boolean(v))}
                          disabled={isBatchRefineRunning}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">#{scene.order}</Badge>
                            <Badge variant="outline">{getSceneStatusLabel(scene.status)}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {scene.summary || '（无概要）'}
                          </div>
                          {err ? (
                            <div className="text-xs text-destructive truncate">{err}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {isCurrent ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : isFail ? (
                            <XCircle className="h-4 w-4 text-red-600" />
                          ) : null}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {isBatchRefineRunning ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{batchOperations.statusMessage || '批量细化中...'}</span>
                  <span>
                    {batchOperations.currentScene}/{batchOperations.totalScenes}
                  </span>
                </div>
                <Progress value={batchOperations.progress} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                注意：细化会由后端 worker 写回 Scene（可能覆盖
                sceneDescription/shotPrompt/motionPrompt/dialogues）。
                建议在开始前完成当前编辑或先关闭详情编辑弹窗。
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isBatchRefineRunning ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    batchRefineAllowCloseRef.current = true;
                    setBatchRefineDialogOpen(false);
                  }}
                >
                  后台运行
                </Button>
                <Button variant="destructive" onClick={requestCancelBatchRefine}>
                  取消批量
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBatchRefineDialogOpen(false)}>
                  关闭
                </Button>
                <Button
                  onClick={() => void handleStartBatchRefine()}
                  disabled={
                    !aiProfileId ||
                    sortedScenes.length === 0 ||
                    batchRefineSelectedIds.length === 0 ||
                    isRunningWorkflow ||
                    isBatchBlocked
                  }
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>开始批量细化</span>
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SceneDetailModal
        open={refineDialogOpen}
        onOpenChange={(open) => {
          setRefineDialogOpen(open);
          if (!open) setSelectedSceneId(null);
        }}
        scene={refineScene}
        prevScene={refinePrevScene}
        characters={projectCharacters}
        worldViewElements={worldViewElements}
        isRefining={isRefining && refiningSceneId === refineScene?.id}
        isGeneratingImages={generatingImagesSceneId === refineScene?.id}
        isGeneratingVideo={generatingVideoSceneId === refineScene?.id}
        refineProgress={refineJobProgress ?? undefined}
        isBatchBlocked={isBatchBlocked}
        isGeneratingSoundDesign={isGeneratingSoundSceneId === refineScene?.id}
        isEstimatingDuration={isEstimatingDurationSceneId === refineScene?.id}
        aiProfileId={aiProfileId}
        onUpdateScene={(sceneId, updates) => {
          if (!currentEpisode?.id) return;
          updateScene(currentProject.id, currentEpisode.id, sceneId, updates);
        }}
        onRefineScene={handleRefineSceneAll}
        onGenerateKeyframePrompt={handleGenerateKeyframePrompt}
        onGenerateSingleKeyframePrompt={handleGenerateSingleKeyframePrompt}
        onGenerateImages={handleGenerateKeyframeImages}
        onGenerateSingleKeyframeImage={handleGenerateSingleKeyframeImage}
        onGenerateVideo={handleGenerateSceneVideo}
        onGenerateSoundDesign={handleGenerateSoundDesign}
        onEstimateDuration={handleEstimateDuration}
        onDeleteScene={(sceneId) => {
          if (!currentEpisode?.id) return;
          void deleteScene(currentProject.id, currentEpisode.id, sceneId);
        }}
        onCopyImg2ImgPack={handleCopyImg2ImgPack}
        parsedKeyframes={parsedRefineKeyframes}
        parsedMotion={parsedRefineMotion}
        onCopyKeyframe={handleCopyKeyframe}
        onCopyKeyframeAvoid={handleCopyKeyframeAvoid}
        onCopyMotion={handleCopyMotion}
        onCopySceneAnchor={handleCopySceneAnchor}
        onCopyDialogues={handleCopyDialogues}
        sceneAnchorCopyText={refineSceneAnchorCopyText}
        getSceneStatusLabel={getSceneStatusLabel}
        isGeneratingKeyframePrompt={generatingKeyframePromptSceneId === refineScene?.id}
        generatingSingleKeyframeKey={generatingSingleKeyframeKey}
        generatingSingleImageKey={generatingSingleImageKey}
      />

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
            onReorder={async (next) => {
              if (!currentEpisode?.id) return;
              const prevById = new Map(scenes.map((s) => [s.id, s] as const));
              const reordered = next.map((s, idx) => ({ ...s, order: idx + 1 }));
              setScenes(reordered);
              const ids = reordered.map((s) => s.id);
              const summaryUpdates = reordered
                .filter((s) => prevById.get(s.id)?.summary !== s.summary)
                .map((s) =>
                  apiUpdateEpisodeScene(currentProject.id, currentEpisode.id, s.id, {
                    summary: s.summary,
                  }),
                );

              try {
                await flushApiEpisodeScenePatchQueue().catch(() => {});
                await Promise.all(summaryUpdates);
                await apiReorderEpisodeScenes(currentProject.id, currentEpisode.id, ids);
                setSortDialogOpen(false);
              } catch (error) {
                toast({
                  title: '保存排序失败',
                  description: error instanceof Error ? error.message : String(error),
                  variant: 'destructive',
                });
                throw error;
              }
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
