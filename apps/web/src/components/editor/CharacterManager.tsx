// ==========================================
// 角色管理组件
// ==========================================
// 功能：
// 1. 角色创建、编辑、删除
// 2. 一键生成完整角色卡（外观/性格/背景）
// 3. 定妆照提示词生成（MJ/SD/通用格式）
// 4. 画风自动传递
// 5. 级联更新影响分析
// ==========================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useCharacterRelationshipStore } from '@/stores/characterRelationshipStore';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useAIProgressStore, type AITask } from '@/stores/aiProgressStore';
import { useCustomStyleStore } from '@/stores/customStyleStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { AIFactory } from '@/lib/ai/factory';
import { logAICall, updateLogWithResponse, updateLogWithError } from '@/lib/ai/debugLogger';
import { parseFirstJSONObject } from '@/lib/ai/jsonExtractor';
import { getInjectionSettings, shouldInjectAtCharacter } from '@/lib/ai/worldViewInjection';
import {
  buildCharacterBasicInfoPrompt,
  buildCharacterPortraitPrompt,
  buildJsonRepairPrompt,
  mergeTokenUsage as mergeCharacterTokenUsage,
  parseCharacterBasicInfo,
  parseCharacterPortraitPrompts,
} from '@/lib/ai/characterGeneration';
import { CharacterBasicInfoSkill, CharacterPortraitSkill } from '@/lib/ai/skills';
import {
  clearCharacterCreateDraft,
  isCharacterCreateDraftMeaningful,
  loadCharacterCreateDraft,
  saveCharacterCreateDraft,
  type CharacterCreateDraft,
} from '@/lib/characterCreateDraft';
import {
  AssetImageRefV1,
  PortraitPrompts,
  ART_STYLE_PRESETS,
  migrateOldStyleToConfig,
  Project,
  Character,
  isCustomStyleId,
} from '@/types';
import {
  analyzeCharacterImpact,
  CharacterChange,
  CharacterAppearance,
  generateUpdateSummary,
  markScenesNeedUpdate,
} from '@/lib/ai/cascadeUpdater';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CharacterRelationshipGraph } from './CharacterRelationshipGraph';
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Users,
  Sparkles,
  Link2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Camera,
  Wand2,
  AlertTriangle,
} from 'lucide-react';

// AI生成状态类型
type GeneratingState = 'idle' | 'generating_basic' | 'generating_portrait';

type AbortReason = 'user' | 'timeout';

// 批量生成状态接口
interface BatchGenerationState {
  isProcessing: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalCount: number;
  completedIds: string[];
  failedIds: string[];
  queue: Array<{ characterId: string; briefDescription: string }>;
}

interface CharacterFormData {
  name: string;
  briefDescription: string;
  appearance: string;
  personality: string;
  background: string;
  themeColor: string;
  primaryColor: string;
  secondaryColor: string;
  portraitPrompts?: PortraitPrompts;
}

function createEmptyFormData(): CharacterFormData {
  return {
    name: '',
    briefDescription: '',
    appearance: '',
    personality: '',
    background: '',
    themeColor: '#6366f1',
    primaryColor: '',
    secondaryColor: '',
    portraitPrompts: undefined,
  };
}

/**
 * 获取当前项目的完整画风提示词
 */
function getProjectStylePrompt(currentProject: Project | null): string {
  if (!currentProject) return '';

  // 优先使用新版 artStyleConfig
  if (currentProject.artStyleConfig?.fullPrompt) {
    return currentProject.artStyleConfig.fullPrompt;
  }

  // 回退：从旧版 style 迁移
  if (currentProject.style) {
    const migratedConfig = migrateOldStyleToConfig(currentProject.style);
    return migratedConfig.fullPrompt;
  }

  return '';
}

/**
 * 获取画风标签名称
 */
function getStyleLabel(currentProject: Project | null): string {
  if (!currentProject) return '';

  if (currentProject.artStyleConfig) {
    const presetId = currentProject.artStyleConfig.presetId;
    // 检查是否为自定义画风
    if (isCustomStyleId(presetId)) {
      const customStyle = useCustomStyleStore.getState().getCustomStyleById(presetId);
      return customStyle ? customStyle.name : '自定义画风';
    }
    const preset = ART_STYLE_PRESETS.find((p) => p.id === presetId);
    return preset ? preset.label : '自定义画风';
  }

  if (currentProject.style) {
    const migratedConfig = migrateOldStyleToConfig(currentProject.style);
    const preset = ART_STYLE_PRESETS.find((p) => p.id === migratedConfig.presetId);
    return preset ? preset.label : currentProject.style;
  }

  return '';
}

interface CharacterManagerProps {
  projectId: string;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function deriveNameFromBrief(briefDescription: string): string {
  const trimmed = briefDescription.trim();
  if (!trimmed) return '';
  const first = trimmed.split(/[，,]/)[0]?.trim() || '';
  return first || trimmed.slice(0, 8);
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|abort/i.test(message);
}

function hasPortraitPromptText(prompts?: PortraitPrompts): prompts is PortraitPrompts {
  return Boolean(
    prompts &&
    (prompts.midjourney?.trim() || prompts.stableDiffusion?.trim() || prompts.general?.trim()),
  );
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function CharacterManager({ projectId }: CharacterManagerProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  const { characters, addCharacter, updateCharacter, deleteCharacter, loadCharacters } =
    useCharacterStore();
  const {
    relationships: characterRelationships,
    loadRelationships,
    generateRelationships,
    isGenerating: isGeneratingRelationships,
  } = useCharacterRelationshipStore();
  const { elements: worldViewElements, loadElements: loadWorldViewElements } = useWorldViewStore();

  // 加载角色数据
  useEffect(() => {
    loadCharacters(projectId);
  }, [projectId, loadCharacters]);
  useEffect(() => {
    void loadRelationships(projectId);
  }, [projectId, loadRelationships]);
  // 加载世界观要素（用于角色生成上下文）
  useEffect(() => {
    loadWorldViewElements(projectId);
  }, [projectId, loadWorldViewElements]);
  const { config, activeProfileId } = useConfigStore();
  const { currentProject } = useProjectStore();
  const { scenes, loadScenes, updateScene: updateSceneInStore } = useStoryboardStore();

  // 若已有分镜，确保加载（用于角色变更后的 needs_update 标记）
  useEffect(() => {
    loadScenes(projectId);
  }, [loadScenes, projectId]);

  // AI进度追踪 Store
  const {
    tasks,
    addTask,
    updateProgress,
    completeTask,
    failTask,
    cancelTask,
    updateTask,
    showPanel,
  } = useAIProgressStore();

  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [formData, setFormData] = useState<CharacterFormData>(() => createEmptyFormData());
  const [generatingState, setGeneratingState] = useState<GeneratingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [dialogStep, setDialogStep] = useState<'basic' | 'portrait'>('basic');
  const portraitReferenceImages = formData.portraitPrompts?.referenceImages ?? [];

  const updatePortraitReferenceImages = useCallback(
    (updater: (prev: AssetImageRefV1[]) => AssetImageRefV1[]) => {
      setFormData((prev) => {
        const prevPrompts = prev.portraitPrompts;
        const base: PortraitPrompts = {
          midjourney: prevPrompts?.midjourney ?? '',
          stableDiffusion: prevPrompts?.stableDiffusion ?? '',
          general: prevPrompts?.general ?? '',
          referenceImages: prevPrompts?.referenceImages ?? [],
        };
        const nextRefs = updater(base.referenceImages ?? []);
        const next: PortraitPrompts = {
          ...base,
          referenceImages: nextRefs.length > 0 ? nextRefs : undefined,
        };
        const hasText = hasPortraitPromptText(next);
        const hasRefs = Boolean(next.referenceImages?.length);
        const keep = hasText || hasRefs;
        return {
          ...prev,
          portraitPrompts: keep ? next : undefined,
        };
      });
    },
    [],
  );

  // 批量生成状态
  const [batchGeneration, setBatchGeneration] = useState<BatchGenerationState>({
    isProcessing: false,
    isPaused: false,
    currentIndex: 0,
    totalCount: 0,
    completedIds: [],
    failedIds: [],
    queue: [],
  });

  // 当前生成任务ID（用于追踪和取消）
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const taskAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const taskAbortReasonsRef = useRef<Map<string, AbortReason>>(new Map());
  const isMountedRef = useRef(true);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogContextRef = useRef<{ isDialogOpen: boolean; editingCharacter: string | null }>({
    isDialogOpen: false,
    editingCharacter: null,
  });
  const [draftRestored, setDraftRestored] = useState(false);
  const [lastBasicTaskId, setLastBasicTaskId] = useState<string | null>(null);
  const [lastPortraitTaskId, setLastPortraitTaskId] = useState<string | null>(null);

  useEffect(() => {
    // 在 React Fast Refresh / 重新挂载场景下，effect 会被重新执行；
    // 若仅在 cleanup 里置 false，会导致 isMountedRef 永远为 false，从而跳过 setState（表现为 UI 卡在“生成中”）。
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  // 兜底：当任务已经结束（success/error/cancelled），但本地 UI 状态仍处于 generating_* 时，自动清理。
  // 这样即便发生热更新导致 isMountedRef 失真，也不会出现“面板显示结束但按钮仍生成中”的卡死状态。
  useEffect(() => {
    if (!currentTaskId) return;

    const task = tasks.find((t) => t.id === currentTaskId);
    if (!task) {
      setGeneratingState('idle');
      setCurrentTaskId(null);
      return;
    }

    if (task.status === 'running' || task.status === 'queued') return;

    setGeneratingState('idle');
    setCurrentTaskId(null);
  }, [currentTaskId, tasks]);

  useEffect(() => {
    dialogContextRef.current = { isDialogOpen, editingCharacter };
  }, [editingCharacter, isDialogOpen]);

  // 级联更新相关状态
  const [cascadeDialogOpen, setCascadeDialogOpen] = useState(false);
  const [cascadeImpactSummary, setCascadeImpactSummary] = useState('');
  const [pendingCascadeUpdate, setPendingCascadeUpdate] = useState<{
    characterId: string;
    affectedSceneIds: string[];
  } | null>(null);

  const [lastAIResponse, setLastAIResponse] = useState<string | null>(null);
  const [lastAIDetails, setLastAIDetails] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormData(createEmptyFormData());
    setEditingCharacter(null);
    setError(null);
    setDialogStep('basic');
    setCopiedFormat(null);
    setGeneratingState('idle');
    setCurrentTaskId(null);
    setLastAIResponse(null);
    setLastAIDetails(null);
    setDraftRestored(false);
    setLastBasicTaskId(null);
    setLastPortraitTaskId(null);
  }, []);

  // 获取当前项目画风的完整描述（英文提示词）
  const styleDescription = useMemo(() => getProjectStylePrompt(currentProject), [currentProject]);

  // 获取画风标签（中文名称）
  const styleLabelText = useMemo(() => getStyleLabel(currentProject), [currentProject]);

  const projectCharacters = characters.filter((c) => c.projectId === projectId);
  const projectWorldViewElements = useMemo(
    () => worldViewElements.filter((e) => e.projectId === projectId),
    [projectId, worldViewElements],
  );

  const isInProgressTask = useCallback(
    (task?: AITask | null) => task?.status === 'running' || task?.status === 'queued',
    [],
  );

  const portraitTaskByCharacterId = useMemo(() => {
    const map = new Map<string, AITask>();
    for (const task of tasks) {
      if (task.type !== 'character_portrait') continue;
      if (task.projectId !== projectId) continue;
      if (!task.characterId) continue;

      const existing = map.get(task.characterId);
      if (!existing || task.createdAt > existing.createdAt) {
        map.set(task.characterId, task);
      }
    }
    return map;
  }, [projectId, tasks]);

  const batchPortraitCandidates = useMemo(
    () =>
      projectCharacters
        .filter((c) => c.appearance && !c.portraitPrompts)
        .filter((c) => !isInProgressTask(portraitTaskByCharacterId.get(c.id))),
    [isInProgressTask, portraitTaskByCharacterId, projectCharacters],
  );

  const draftPortraitTask = useMemo(() => {
    if (!lastPortraitTaskId) return null;
    return tasks.find((t) => t.id === lastPortraitTaskId) ?? null;
  }, [lastPortraitTaskId, tasks]);

  const dialogPortraitTask = useMemo(() => {
    if (editingCharacter) {
      return portraitTaskByCharacterId.get(editingCharacter) ?? null;
    }
    return draftPortraitTask;
  }, [draftPortraitTask, editingCharacter, portraitTaskByCharacterId]);

  const isDialogPortraitGenerating = isInProgressTask(dialogPortraitTask);

  const buildCreateDraft = useCallback(
    (nextFormData: CharacterFormData): CharacterCreateDraft => ({
      version: 1,
      projectId,
      formData: {
        name: nextFormData.name,
        briefDescription: nextFormData.briefDescription,
        appearance: nextFormData.appearance,
        personality: nextFormData.personality,
        background: nextFormData.background,
        themeColor: nextFormData.themeColor,
        primaryColor: nextFormData.primaryColor,
        secondaryColor: nextFormData.secondaryColor,
        portraitPrompts: nextFormData.portraitPrompts,
      },
      dialogStep,
      lastAIResponse,
      lastAIDetails,
      taskIds: {
        basicInfoTaskId: lastBasicTaskId,
        portraitTaskId: lastPortraitTaskId,
      },
      updatedAt: Date.now(),
    }),
    [dialogStep, lastAIDetails, lastAIResponse, lastBasicTaskId, lastPortraitTaskId, projectId],
  );

  const persistCreateDraft = useCallback(
    (nextFormData: CharacterFormData) => {
      const draft = buildCreateDraft(nextFormData);
      if (isCharacterCreateDraftMeaningful(draft)) {
        saveCharacterCreateDraft(projectId, draft);
      } else {
        clearCharacterCreateDraft(projectId);
      }
    },
    [buildCreateDraft, projectId],
  );

  const flushCreateDraft = useCallback(
    (nextFormData?: CharacterFormData) => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      persistCreateDraft(nextFormData ?? formData);
    },
    [formData, persistCreateDraft],
  );

  const hydrateCreateDraftFromTasks = useCallback(
    (draft: CharacterCreateDraft): CharacterCreateDraft => {
      const store = useAIProgressStore.getState();
      let changed = false;

      let nextFormData = draft.formData;
      let nextDialogStep = draft.dialogStep;
      let nextLastAIResponse = draft.lastAIResponse;
      let nextLastAIDetails = draft.lastAIDetails;

      const basicTaskId = draft.taskIds.basicInfoTaskId;
      if (
        basicTaskId &&
        (!nextFormData.name.trim() ||
          !nextFormData.appearance.trim() ||
          !nextFormData.personality.trim() ||
          !nextFormData.background.trim())
      ) {
        const task = store.getTask(basicTaskId);
        const content = task?.status === 'success' ? task.response?.content : null;
        if (content) {
          const parsed = parseFirstJSONObject(content);
          if (parsed.ok) {
            const name = pickString(parsed.value.name);
            const appearance = pickString(parsed.value.appearance);
            const personality = pickString(parsed.value.personality);
            const background = pickString(parsed.value.background);

            const merged: CharacterFormData = {
              ...nextFormData,
              name: nextFormData.name.trim()
                ? nextFormData.name
                : name || deriveNameFromBrief(nextFormData.briefDescription),
              appearance: nextFormData.appearance.trim()
                ? nextFormData.appearance
                : appearance || nextFormData.appearance,
              personality: nextFormData.personality.trim()
                ? nextFormData.personality
                : personality || nextFormData.personality,
              background: nextFormData.background.trim()
                ? nextFormData.background
                : background || nextFormData.background,
            };

            if (merged.appearance.trim()) {
              nextFormData = merged;
              nextLastAIResponse = nextLastAIResponse || content;
              changed = true;
            }
          } else {
            nextLastAIDetails = nextLastAIDetails || `解析任务响应失败：${parsed.reason}`;
            changed = true;
          }
        }
      }

      const portraitTaskId = draft.taskIds.portraitTaskId;
      const hasPortraitPrompts =
        Boolean(nextFormData.portraitPrompts) &&
        Boolean(
          nextFormData.portraitPrompts?.midjourney.trim() ||
          nextFormData.portraitPrompts?.stableDiffusion.trim() ||
          nextFormData.portraitPrompts?.general.trim(),
        );

      if (portraitTaskId && !hasPortraitPrompts) {
        const task = store.getTask(portraitTaskId);
        const content = task?.status === 'success' ? task.response?.content : null;
        if (content) {
          const parsed = parseFirstJSONObject(content);
          if (parsed.ok) {
            const midjourney = pickString(parsed.value.midjourney);
            const stableDiffusion = pickString(parsed.value.stableDiffusion);
            const general = pickString(parsed.value.general);

            if (midjourney || stableDiffusion || general) {
              nextFormData = {
                ...nextFormData,
                portraitPrompts: {
                  midjourney: midjourney || '',
                  stableDiffusion: stableDiffusion || '',
                  general: general || '',
                  ...(nextFormData.portraitPrompts?.referenceImages?.length
                    ? { referenceImages: nextFormData.portraitPrompts.referenceImages }
                    : {}),
                },
              };
              nextDialogStep = 'portrait';
              nextLastAIResponse = nextLastAIResponse || content;
              changed = true;
            }
          } else {
            nextLastAIDetails = nextLastAIDetails || `解析任务响应失败：${parsed.reason}`;
            changed = true;
          }
        }
      }

      if (!changed) return draft;

      return {
        ...draft,
        formData: nextFormData,
        dialogStep: nextDialogStep,
        lastAIResponse: nextLastAIResponse,
        lastAIDetails: nextLastAIDetails,
        updatedAt: Date.now(),
      };
    },
    [],
  );

  // 创建角色：弹窗打开时恢复草稿（关闭/切换后仍能回填）
  useEffect(() => {
    if (!isDialogOpen) return;
    if (editingCharacter) return;

    const draft = loadCharacterCreateDraft(projectId);
    if (draft) {
      const hydrated = hydrateCreateDraftFromTasks(draft);
      if (hydrated !== draft) {
        saveCharacterCreateDraft(projectId, hydrated);
      }

      setFormData(hydrated.formData);
      setDialogStep(hydrated.dialogStep);
      setLastAIResponse(hydrated.lastAIResponse);
      setLastAIDetails(hydrated.lastAIDetails);
      setLastBasicTaskId(hydrated.taskIds.basicInfoTaskId);
      setLastPortraitTaskId(hydrated.taskIds.portraitTaskId);
      setError(null);
      setCopiedFormat(null);
      setDraftRestored(true);
      return;
    }

    resetForm();
  }, [editingCharacter, hydrateCreateDraftFromTasks, isDialogOpen, projectId, resetForm]);

  // 创建角色：输入与生成过程自动保存草稿（防止关闭弹窗导致丢失）
  useEffect(() => {
    if (!isDialogOpen) return;
    if (editingCharacter) return;

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      persistCreateDraft(formData);
    }, 400);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [isDialogOpen, editingCharacter, formData, persistCreateDraft]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (editingCharacter) {
        resetForm();
      } else {
        flushCreateDraft();
      }
    }
    setIsDialogOpen(nextOpen);
  };

  const handleOpenCreateDialog = () => {
    setEditingCharacter(null);
  };

  const handleDiscardCreateDraft = async () => {
    const ok = await confirm({
      title: '丢弃角色草稿？',
      description: '这会清空当前未保存的角色创建内容（包括 AI 已生成的回填结果）。',
      confirmText: '丢弃草稿',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;

    clearCharacterCreateDraft(projectId);
    setDraftRestored(false);
    resetForm();
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    if (editingCharacter) {
      // 获取原角色数据，用于比较变更
      const originalCharacter = projectCharacters.find((c) => c.id === editingCharacter);

      updateCharacter(projectId, editingCharacter, {
        ...formData,
        briefDescription: formData.briefDescription,
        portraitPrompts: formData.portraitPrompts,
      });

      // 分析级联影响
      if (originalCharacter && scenes.length > 0) {
        const changedFields: CharacterChange['field'][] = [];
        if (originalCharacter.appearance !== formData.appearance) changedFields.push('appearance');
        if (originalCharacter.personality !== formData.personality)
          changedFields.push('personality');
        if (originalCharacter.name !== formData.name) changedFields.push('name');
        if (originalCharacter.primaryColor !== formData.primaryColor)
          changedFields.push('primaryColor');
        if (originalCharacter.secondaryColor !== formData.secondaryColor)
          changedFields.push('secondaryColor');

        if (changedFields.length > 0) {
          // 构建角色出场关系（简化版：假设角色在所有分镜中可能出现）
          const appearances: CharacterAppearance[] = scenes.map((s) => ({
            sceneId: s.id,
            characterId: editingCharacter,
          }));

          // 只分析第一个变更的字段（简化）
          const change: CharacterChange = {
            characterId: editingCharacter,
            field: changedFields[0],
          };

          const impact = analyzeCharacterImpact(change, scenes, appearances);

          if (impact.affectedScenes.length > 0) {
            const summary = generateUpdateSummary(impact);
            setCascadeImpactSummary(summary);
            setPendingCascadeUpdate({
              characterId: editingCharacter,
              affectedSceneIds: impact.affectedScenes.map((s) => s.id),
            });
            setCascadeDialogOpen(true);
          }
        }
      }
    } else {
      addCharacter(projectId, {
        ...formData,
        projectId,
        briefDescription: formData.briefDescription,
        portraitPrompts: formData.portraitPrompts,
        relationships: [],
        appearances: [],
      });
      clearCharacterCreateDraft(projectId);
    }

    resetForm();
    setIsDialogOpen(false);
  };

  // 确认级联更新
  const handleConfirmCascadeUpdate = () => {
    if (pendingCascadeUpdate) {
      // 标记受影响的分镜为需要更新
      const updatedScenes = markScenesNeedUpdate(scenes, pendingCascadeUpdate.affectedSceneIds);
      updatedScenes.forEach((scene) => {
        if (pendingCascadeUpdate.affectedSceneIds.includes(scene.id)) {
          updateSceneInStore(projectId, scene.id, { status: 'needs_update' });
        }
      });
    }
    setCascadeDialogOpen(false);
    setPendingCascadeUpdate(null);
  };

  // 跳过级联更新
  const handleSkipCascadeUpdate = () => {
    setCascadeDialogOpen(false);
    setPendingCascadeUpdate(null);
  };

  const handleEdit = (characterId: string) => {
    const character = projectCharacters.find((c) => c.id === characterId);
    if (character) {
      setFormData({
        name: character.name,
        briefDescription: character.briefDescription || '',
        appearance: character.appearance,
        personality: character.personality,
        background: character.background,
        themeColor: character.themeColor || '#6366f1',
        primaryColor: character.primaryColor || '',
        secondaryColor: character.secondaryColor || '',
        portraitPrompts: character.portraitPrompts,
      });
      setEditingCharacter(characterId);
      const portraitTask = portraitTaskByCharacterId.get(characterId);
      const isPortraitGenerating =
        portraitTask?.status === 'running' || portraitTask?.status === 'queued';
      setDialogStep(isPortraitGenerating || character.portraitPrompts ? 'portrait' : 'basic');
      setIsDialogOpen(true);
    }
  };

  const handleDelete = async (characterId: string) => {
    const ok = await confirm({
      title: '确认删除角色？',
      description: '删除后无法恢复。已生成的分镜内容可能需要重新生成。',
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;
    deleteCharacter(projectId, characterId);
  };

  const handleGenerateRelationshipGraph = async () => {
    if (!config?.aiProfileId) {
      toast({
        title: '缺少 AI Profile',
        description: '请先在 API 配置中选择可用的 AI Profile。',
        variant: 'destructive',
      });
      return;
    }
    try {
      await generateRelationships({ projectId, aiProfileId: config.aiProfileId });
      toast({ title: '关系图谱已更新', description: '已同步最新角色关系数据。' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      toast({ title: '关系图谱生成失败', description: detail, variant: 'destructive' });
    }
  };

  // 复制提示词到剪贴板
  const handleCopyPrompt = async (format: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const abortTask = useCallback((taskId: string, reason: AbortReason) => {
    taskAbortReasonsRef.current.set(taskId, reason);
    taskAbortControllersRef.current.get(taskId)?.abort();
  }, []);

  const abortCurrentTask = useCallback(
    (reason: AbortReason) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      abortTask(taskId, reason);
    },
    [abortTask],
  );

  const getAbortReason = useCallback(
    (taskId: string) => taskAbortReasonsRef.current.get(taskId),
    [],
  );
  const isAbortableTask = useCallback(
    (taskId: string) => taskAbortControllersRef.current.has(taskId),
    [],
  );

  // 一键生成基础信息（外观+性格+背景）- 集成进度追踪
  const handleGenerateBasicInfo = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }

    const briefDescription = formData.briefDescription.trim();
    if (!briefDescription) {
      setError('请先输入角色简短描述');
      return;
    }

    const baseFormData: CharacterFormData = { ...formData };
    const portraitTaskIdForDraft = lastPortraitTaskId;
    const targetCharacterId = editingCharacter;

    setGeneratingState('generating_basic');
    setError(null);
    setLastAIResponse(null);
    setLastAIDetails(null);

    // 创建AI任务并显示开发者面板
    const taskId = addTask({
      type: 'character_basic_info',
      title: `生成角色信息: ${formData.briefDescription.slice(0, 20)}...`,
      description: `根据简短描述生成完整角色卡（外观/性格/背景）`,
      status: 'running',
      priority: 'normal',
      progress: 0,
      projectId,
      maxRetries: 3,
    });
    setCurrentTaskId(taskId);
    showPanel();

    if (!editingCharacter) {
      setLastBasicTaskId(taskId);
      const draft: CharacterCreateDraft = {
        version: 1,
        projectId,
        formData: baseFormData,
        dialogStep: 'basic',
        lastAIResponse: null,
        lastAIDetails: null,
        taskIds: {
          basicInfoTaskId: taskId,
          portraitTaskId: portraitTaskIdForDraft,
        },
        updatedAt: Date.now(),
      };
      saveCharacterCreateDraft(projectId, draft);
    }

    let logId = '';
    let firstResponseContent = '';
    let parseDetails: string | null = null;

    try {
      const client = AIFactory.createClient(config);
      const styleDesc = styleDescription;
      const injectionSettings = getInjectionSettings(projectId);
      const shouldInjectWorldView = shouldInjectAtCharacter(injectionSettings);
      const worldViewForPrompt = shouldInjectWorldView ? projectWorldViewElements : [];

      const existingCharacters = projectCharacters.filter((c) =>
        targetCharacterId ? c.id !== targetCharacterId : true,
      );

      const colorHints = [
        baseFormData.primaryColor?.trim() ? `主色 ${baseFormData.primaryColor.trim()}` : null,
        baseFormData.secondaryColor?.trim() ? `辅色 ${baseFormData.secondaryColor.trim()}` : null,
      ]
        .filter(Boolean)
        .join('，');

      const briefForPrompt = colorHints
        ? `${briefDescription}\n（色彩偏好：${colorHints}）`
        : briefDescription;

      const {
        key: basicInfoPromptKey,
        template: basicInfoPromptTemplate,
        prompt,
      } = await buildCharacterBasicInfoPrompt({
        briefDescription: briefForPrompt,
        summary: (currentProject?.summary ?? '').trim(),
        protagonist: (currentProject?.protagonist ?? '').trim(),
        artStyle:
          currentProject?.artStyleConfig ??
          (currentProject?.style ? migrateOldStyleToConfig(currentProject.style) : undefined),
        worldViewElements: worldViewForPrompt,
        existingCharacters,
      });

      // 记录日志
      logId = logAICall('character_basic_info', {
        skillName: CharacterBasicInfoSkill.name,
        promptTemplate: basicInfoPromptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId,
          characterId: targetCharacterId ?? undefined,
          skipProgressBridge: true,
          systemPromptKey: basicInfoPromptKey,
          briefDescription,
          style: styleDesc,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      updateProgress(taskId, 30, '正在调用AI生成...');

      const controller = new AbortController();
      taskAbortControllersRef.current.set(taskId, controller);
      taskAbortReasonsRef.current.delete(taskId);
      const timeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 60_000);

      let response;
      try {
        response = await client.chat([{ role: 'user', content: prompt }], {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        if (taskAbortControllersRef.current.get(taskId) === controller) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      updateProgress(taskId, 80, '正在解析响应...');
      firstResponseContent = response.content || '';
      if (isMountedRef.current) setLastAIResponse(firstResponseContent);

      // 记录原始响应（即便格式不正确，也方便排查）
      let mergedTokenUsage = response.tokenUsage;
      updateLogWithResponse(logId, { content: firstResponseContent, tokenUsage: mergedTokenUsage });

      const commitBasicInfo = (
        next: {
          name: string;
          appearance: string;
          personality: string;
          background: string;
          primaryColor?: string;
          secondaryColor?: string;
        },
        raw: string,
        tokenUsage?: { prompt: number; completion: number; total: number },
      ) => {
        if (!targetCharacterId) {
          const merged: CharacterFormData = {
            ...baseFormData,
            name: baseFormData.name.trim()
              ? baseFormData.name
              : next.name || deriveNameFromBrief(briefDescription),
            appearance: baseFormData.appearance.trim() ? baseFormData.appearance : next.appearance,
            personality: baseFormData.personality.trim()
              ? baseFormData.personality
              : next.personality,
            background: baseFormData.background.trim() ? baseFormData.background : next.background,
            primaryColor: baseFormData.primaryColor.trim()
              ? baseFormData.primaryColor
              : next.primaryColor || baseFormData.primaryColor,
            secondaryColor: baseFormData.secondaryColor.trim()
              ? baseFormData.secondaryColor
              : next.secondaryColor || baseFormData.secondaryColor,
          };
          const draft: CharacterCreateDraft = {
            version: 1,
            projectId,
            formData: merged,
            dialogStep: 'basic',
            lastAIResponse: raw,
            lastAIDetails: parseDetails,
            taskIds: {
              basicInfoTaskId: taskId,
              portraitTaskId: portraitTaskIdForDraft,
            },
            updatedAt: Date.now(),
          };
          saveCharacterCreateDraft(projectId, draft);
        }

        const { isDialogOpen: isDialogVisible, editingCharacter: activeEditingCharacter } =
          dialogContextRef.current;
        const shouldUpdateUI =
          isMountedRef.current &&
          isDialogVisible &&
          (targetCharacterId
            ? activeEditingCharacter === targetCharacterId
            : activeEditingCharacter === null);

        if (shouldUpdateUI) {
          setFormData((prev) => ({
            ...prev,
            name: prev.name.trim() ? prev.name : next.name || deriveNameFromBrief(briefDescription),
            appearance: prev.appearance.trim() ? prev.appearance : next.appearance,
            personality: prev.personality.trim() ? prev.personality : next.personality,
            background: prev.background.trim() ? prev.background : next.background,
            primaryColor: prev.primaryColor.trim()
              ? prev.primaryColor
              : next.primaryColor || prev.primaryColor,
            secondaryColor: prev.secondaryColor.trim()
              ? prev.secondaryColor
              : next.secondaryColor || prev.secondaryColor,
          }));
          setDialogStep('basic');
        }
        completeTask(taskId, { content: raw, tokenUsage });
      };

      const attempt1 = parseCharacterBasicInfo(firstResponseContent);
      if (attempt1.ok) {
        commitBasicInfo(attempt1.value, firstResponseContent, mergedTokenUsage);
        return;
      }

      // 第二次：尝试让模型“修复成严格JSON”
      updateTask(taskId, { retryCount: 1 });
      updateProgress(taskId, 60, '输出格式异常，尝试自动修复...');
      parseDetails = [
        attempt1.error.reason,
        attempt1.error.details ? `详情：\n${attempt1.error.details}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      if (isMountedRef.current) setLastAIDetails(parseDetails);

      const {
        key: jsonRepairPromptKey,
        template: jsonRepairPromptTemplate,
        prompt: repairPrompt,
      } = await buildJsonRepairPrompt({
        requiredKeys: [
          'name',
          'appearance',
          'personality',
          'background',
          'primaryColor',
          'secondaryColor',
        ],
        raw: firstResponseContent,
        extraRules: ['primaryColor/secondaryColor 必须是 #RRGGBB（可不带 #，系统会自动补齐）'],
      });

      const repairLogId = logAICall('character_basic_info', {
        skillName: CharacterBasicInfoSkill.name,
        promptTemplate: jsonRepairPromptTemplate,
        filledPrompt: repairPrompt,
        messages: [{ role: 'user', content: repairPrompt }],
        context: {
          projectId,
          characterId: targetCharacterId ?? undefined,
          skipProgressBridge: true,
          systemPromptKey: jsonRepairPromptKey,
          briefDescription,
          style: styleDesc,
          attempt: 2,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      const repairController = new AbortController();
      taskAbortControllersRef.current.set(taskId, repairController);
      taskAbortReasonsRef.current.delete(taskId);
      const repairTimeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 60_000);

      let repairResponse;
      try {
        repairResponse = await client.chat([{ role: 'user', content: repairPrompt }], {
          signal: repairController.signal,
        });
      } finally {
        clearTimeout(repairTimeoutId);
        if (taskAbortControllersRef.current.get(taskId) === repairController) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      const repairedContent = repairResponse.content || '';
      if (isMountedRef.current) setLastAIResponse(repairedContent);
      mergedTokenUsage = mergeCharacterTokenUsage(mergedTokenUsage, repairResponse.tokenUsage);
      updateLogWithResponse(repairLogId, {
        content: repairedContent,
        tokenUsage: repairResponse.tokenUsage,
      });

      const attempt2 = parseCharacterBasicInfo(repairedContent);
      if (attempt2.ok) {
        commitBasicInfo(attempt2.value, repairedContent, mergedTokenUsage);
        return;
      }

      parseDetails = [
        parseDetails,
        `二次纠偏仍失败：${attempt2.error.reason}`,
        attempt2.error.details ? `详情：\n${attempt2.error.details}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      if (isMountedRef.current) setLastAIDetails(parseDetails);

      throw new Error(`AI 返回格式仍不正确：${attempt2.error.reason}`);
    } catch (err) {
      console.error('生成角色信息失败:', err);

      if (isAbortError(err)) {
        const reason = getAbortReason(taskId);
        const msg =
          reason === 'timeout' ? '请求超时（60秒），请检查网络或更换模型后重试。' : '已取消生成';
        if (isMountedRef.current) setError(msg);
        cancelTask(taskId);
        if (logId) updateLogWithError(logId, msg);
        return;
      }

      const errorMsg = err instanceof Error ? err.message : '生成角色信息失败，请重试';
      if (isMountedRef.current) setError(errorMsg);
      if (logId) updateLogWithError(logId, errorMsg);
      failTask(taskId, {
        message: errorMsg,
        details: parseDetails || undefined,
        retryable: true,
      });
    } finally {
      taskAbortControllersRef.current.delete(taskId);
      taskAbortReasonsRef.current.delete(taskId);
      if (isMountedRef.current) {
        setGeneratingState('idle');
        setCurrentTaskId(null);
      }
    }
  };

  // 生成定妆照提示词（多格式）- 集成进度追踪
  const handleGeneratePortraitPrompts = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.appearance.trim()) {
      setError('请先生成或填写外观描述');
      return;
    }

    const baseFormData: CharacterFormData = { ...formData };
    const basicTaskIdForDraft = lastBasicTaskId;
    const targetCharacterId = editingCharacter;

    const existingRunningTask = targetCharacterId
      ? portraitTaskByCharacterId.get(targetCharacterId)
      : draftPortraitTask;
    if (
      existingRunningTask &&
      (existingRunningTask.status === 'running' || existingRunningTask.status === 'queued')
    ) {
      toast({
        title: '定妆照正在生成中',
        description: '当前角色已有定妆照提示词生成任务在执行，可前往进度面板查看。',
      });
      showPanel();
      return;
    }

    setGeneratingState('generating_portrait');
    setError(null);
    setLastAIResponse(null);
    setLastAIDetails(null);

    // 创建AI任务并显示开发者面板
    const taskId = addTask({
      type: 'character_portrait',
      title: `生成定妆照: ${formData.name || '未命名角色'}`,
      description: `为角色生成MJ/SD/通用格式的定妆照提示词`,
      status: 'running',
      priority: 'normal',
      progress: 0,
      projectId,
      characterId: editingCharacter ?? undefined,
      maxRetries: 3,
    });
    setCurrentTaskId(taskId);
    showPanel();

    if (!editingCharacter) {
      setLastPortraitTaskId(taskId);
      const draft: CharacterCreateDraft = {
        version: 1,
        projectId,
        formData: baseFormData,
        dialogStep: 'portrait',
        lastAIResponse: null,
        lastAIDetails: null,
        taskIds: {
          basicInfoTaskId: basicTaskIdForDraft,
          portraitTaskId: taskId,
        },
        updatedAt: Date.now(),
      };
      saveCharacterCreateDraft(projectId, draft);
    }

    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const styleDesc = styleDescription;

      const injectionSettings = getInjectionSettings(projectId);
      const shouldInjectWorldView = shouldInjectAtCharacter(injectionSettings);
      const worldViewForPrompt = shouldInjectWorldView ? projectWorldViewElements : [];

      const {
        key: portraitPromptKey,
        template: portraitPromptTemplate,
        prompt,
      } = await buildCharacterPortraitPrompt({
        characterName: formData.name,
        characterAppearance: formData.appearance,
        primaryColor: formData.primaryColor?.trim() || undefined,
        secondaryColor: formData.secondaryColor?.trim() || undefined,
        artStyle:
          currentProject?.artStyleConfig ??
          (currentProject?.style ? migrateOldStyleToConfig(currentProject.style) : undefined),
        worldViewElements: worldViewForPrompt,
      });

      // 记录日志
      logId = logAICall('character_portrait', {
        skillName: CharacterPortraitSkill.name,
        promptTemplate: portraitPromptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId,
          characterId: targetCharacterId ?? undefined,
          skipProgressBridge: true,
          systemPromptKey: portraitPromptKey,
          characterName: formData.name,
          appearance: formData.appearance,
          style: styleDesc,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      updateProgress(taskId, 30, '正在调用AI生成提示词...');

      const controller = new AbortController();
      taskAbortControllersRef.current.set(taskId, controller);
      taskAbortReasonsRef.current.delete(taskId);
      const timeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

      let response;
      try {
        response = await client.chat([{ role: 'user', content: prompt }], {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        if (taskAbortControllersRef.current.get(taskId) === controller) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      updateProgress(taskId, 80, '正在解析响应...');
      const firstResponseContent = response.content || '';
      if (isMountedRef.current) setLastAIResponse(firstResponseContent);

      let mergedTokenUsage = response.tokenUsage;
      updateLogWithResponse(logId, { content: firstResponseContent, tokenUsage: mergedTokenUsage });

      const commitPortraitPrompts = (
        next: PortraitPrompts,
        raw: string,
        tokenUsage?: { prompt: number; completion: number; total: number },
      ) => {
        const preservedReferenceImages = next.referenceImages?.length
          ? next.referenceImages
          : (formData.portraitPrompts?.referenceImages ??
            baseFormData.portraitPrompts?.referenceImages);

        const mergedPortraitPrompts: PortraitPrompts = {
          midjourney: next.midjourney,
          stableDiffusion: next.stableDiffusion,
          general: next.general,
          ...(preservedReferenceImages ? { referenceImages: preservedReferenceImages } : {}),
        };

        if (targetCharacterId) {
          updateCharacter(projectId, targetCharacterId, { portraitPrompts: mergedPortraitPrompts });
        } else {
          const merged: CharacterFormData = {
            ...baseFormData,
            portraitPrompts: mergedPortraitPrompts,
          };
          const draft: CharacterCreateDraft = {
            version: 1,
            projectId,
            formData: merged,
            dialogStep: 'portrait',
            lastAIResponse: raw,
            lastAIDetails: null,
            taskIds: {
              basicInfoTaskId: basicTaskIdForDraft,
              portraitTaskId: taskId,
            },
            updatedAt: Date.now(),
          };
          saveCharacterCreateDraft(projectId, draft);
        }

        const { isDialogOpen: isDialogVisible, editingCharacter: activeEditingCharacter } =
          dialogContextRef.current;
        const shouldUpdateUI =
          isMountedRef.current &&
          isDialogVisible &&
          (targetCharacterId
            ? activeEditingCharacter === targetCharacterId
            : activeEditingCharacter === null);

        if (shouldUpdateUI) {
          setFormData((prev) => ({
            ...prev,
            portraitPrompts: {
              midjourney:
                mergedPortraitPrompts.midjourney || prev.portraitPrompts?.midjourney || '',
              stableDiffusion:
                mergedPortraitPrompts.stableDiffusion ||
                prev.portraitPrompts?.stableDiffusion ||
                '',
              general: mergedPortraitPrompts.general || prev.portraitPrompts?.general || '',
              ...(mergedPortraitPrompts.referenceImages?.length
                ? { referenceImages: mergedPortraitPrompts.referenceImages }
                : prev.portraitPrompts?.referenceImages?.length
                  ? { referenceImages: prev.portraitPrompts.referenceImages }
                  : {}),
            },
          }));
          setDialogStep('portrait');
        }
        completeTask(taskId, { content: raw, tokenUsage });
      };

      const attempt1 = parseCharacterPortraitPrompts(firstResponseContent);
      if (attempt1.ok) {
        commitPortraitPrompts(attempt1.value, firstResponseContent, mergedTokenUsage);
        return;
      }

      updateTask(taskId, { retryCount: 1 });
      updateProgress(taskId, 60, '输出格式异常，尝试自动修复...');

      const {
        key: jsonRepairPromptKey,
        template: jsonRepairPromptTemplate,
        prompt: repairPrompt,
      } = await buildJsonRepairPrompt({
        requiredKeys: ['midjourney', 'stableDiffusion', 'general'],
        raw: firstResponseContent,
      });

      const repairLogId = logAICall('character_portrait', {
        skillName: CharacterPortraitSkill.name,
        promptTemplate: jsonRepairPromptTemplate,
        filledPrompt: repairPrompt,
        messages: [{ role: 'user', content: repairPrompt }],
        context: {
          projectId,
          characterId: targetCharacterId ?? undefined,
          skipProgressBridge: true,
          systemPromptKey: jsonRepairPromptKey,
          characterName: formData.name,
          attempt: 2,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      const repairController = new AbortController();
      taskAbortControllersRef.current.set(taskId, repairController);
      taskAbortReasonsRef.current.delete(taskId);
      const repairTimeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

      let repairResponse;
      try {
        repairResponse = await client.chat([{ role: 'user', content: repairPrompt }], {
          signal: repairController.signal,
        });
      } finally {
        clearTimeout(repairTimeoutId);
        if (taskAbortControllersRef.current.get(taskId) === repairController) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      const repairedContent = repairResponse.content || '';
      if (isMountedRef.current) setLastAIResponse(repairedContent);
      mergedTokenUsage = mergeCharacterTokenUsage(mergedTokenUsage, repairResponse.tokenUsage);
      updateLogWithResponse(repairLogId, {
        content: repairedContent,
        tokenUsage: repairResponse.tokenUsage,
      });

      const attempt2 = parseCharacterPortraitPrompts(repairedContent);
      if (attempt2.ok) {
        commitPortraitPrompts(attempt2.value, repairedContent, mergedTokenUsage);
        return;
      }

      throw new Error(`AI 返回缺少定妆照提示词内容：${attempt2.error.reason}`);
    } catch (err) {
      console.error('生成定妆照提示词失败:', err);
      if (isAbortError(err)) {
        const reason = getAbortReason(taskId);
        const msg =
          reason === 'timeout' ? '请求超时（90秒），请检查网络或更换模型后重试。' : '已取消生成';
        if (isMountedRef.current) setError(msg);
        cancelTask(taskId);
        if (logId) updateLogWithError(logId, msg);
        return;
      }

      const errorMsg = err instanceof Error ? err.message : '生成定妆照提示词失败，请重试';
      if (isMountedRef.current) setError(errorMsg);
      if (logId) updateLogWithError(logId, errorMsg);
      failTask(taskId, {
        message: errorMsg,
        retryable: true,
      });
    } finally {
      taskAbortControllersRef.current.delete(taskId);
      taskAbortReasonsRef.current.delete(taskId);
      if (isMountedRef.current) {
        setGeneratingState('idle');
        setCurrentTaskId(null);
      }
    }
  };

  // 批量生成多个角色的定妆照提示词
  const handleGeneratePortraitPromptsForCharacter = async (character: Character) => {
    if (!config) {
      toast({ title: '请先配置AI服务' });
      return;
    }

    const appearance = character.appearance?.trim() || '';
    if (!appearance) {
      toast({ title: '缺少外观描述', description: '请先为角色补充外观描述后再生成定妆照提示词。' });
      return;
    }

    const existingTask = portraitTaskByCharacterId.get(character.id);
    if (existingTask && (existingTask.status === 'running' || existingTask.status === 'queued')) {
      toast({
        title: '定妆照正在生成中',
        description: '该角色已有生成任务在执行，可前往进度面板查看。',
      });
      showPanel();
      return;
    }

    const taskId = addTask({
      type: 'character_portrait',
      title: `生成定妆照: ${character.name || '未命名角色'}`,
      description: `为角色 ${character.name || '未命名角色'} 生成MJ/SD/通用格式的定妆照提示词`,
      status: 'running',
      priority: 'normal',
      progress: 0,
      projectId,
      characterId: character.id,
      maxRetries: 3,
    });
    showPanel();

    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const styleDesc = styleDescription;
      const injectionSettings = getInjectionSettings(projectId);
      const shouldInjectWorldView = shouldInjectAtCharacter(injectionSettings);
      const worldViewForPrompt = shouldInjectWorldView ? projectWorldViewElements : [];
      const artStyleForPrompt =
        currentProject?.artStyleConfig ??
        (currentProject?.style ? migrateOldStyleToConfig(currentProject.style) : undefined);

      const {
        key: portraitPromptKey,
        template: portraitPromptTemplate,
        prompt,
      } = await buildCharacterPortraitPrompt({
        characterName: character.name,
        characterAppearance: appearance,
        primaryColor: character.primaryColor?.trim() || undefined,
        secondaryColor: character.secondaryColor?.trim() || undefined,
        artStyle: artStyleForPrompt,
        worldViewElements: worldViewForPrompt,
      });

      logId = logAICall('character_portrait', {
        skillName: CharacterPortraitSkill.name,
        promptTemplate: portraitPromptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId,
          characterId: character.id,
          skipProgressBridge: true,
          systemPromptKey: portraitPromptKey,
          characterName: character.name,
          appearance,
          style: styleDesc,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      updateProgress(taskId, 30, '正在调用AI生成提示词...');

      const controller = new AbortController();
      taskAbortControllersRef.current.set(taskId, controller);
      taskAbortReasonsRef.current.delete(taskId);
      const timeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

      let response;
      try {
        response = await client.chat([{ role: 'user', content: prompt }], {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
        if (taskAbortControllersRef.current.get(taskId) === controller) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      updateProgress(taskId, 80, '正在解析响应...');
      const firstResponseContent = response.content || '';
      let mergedTokenUsage = response.tokenUsage;
      updateLogWithResponse(logId, { content: firstResponseContent, tokenUsage: mergedTokenUsage });

      const commit = (
        next: PortraitPrompts,
        raw: string,
        tokenUsage?: { prompt: number; completion: number; total: number },
      ) => {
        const preservedReferenceImages = next.referenceImages?.length
          ? next.referenceImages
          : character.portraitPrompts?.referenceImages;
        updateCharacter(projectId, character.id, {
          portraitPrompts: {
            ...next,
            ...(preservedReferenceImages ? { referenceImages: preservedReferenceImages } : {}),
          },
        });
        completeTask(taskId, { content: raw, tokenUsage });
      };

      const attempt1 = parseCharacterPortraitPrompts(firstResponseContent);
      if (attempt1.ok) {
        commit(attempt1.value, firstResponseContent, mergedTokenUsage);
        return;
      }

      updateTask(taskId, { retryCount: 1 });
      updateProgress(taskId, 60, '输出格式异常，尝试自动修复...');

      const {
        key: jsonRepairPromptKey,
        template: jsonRepairPromptTemplate,
        prompt: repairPrompt,
      } = await buildJsonRepairPrompt({
        requiredKeys: ['midjourney', 'stableDiffusion', 'general'],
        raw: firstResponseContent,
      });

      const repairLogId = logAICall('character_portrait', {
        skillName: CharacterPortraitSkill.name,
        promptTemplate: jsonRepairPromptTemplate,
        filledPrompt: repairPrompt,
        messages: [{ role: 'user', content: repairPrompt }],
        context: {
          projectId,
          characterId: character.id,
          skipProgressBridge: true,
          systemPromptKey: jsonRepairPromptKey,
          characterName: character.name,
          attempt: 2,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          profileId: activeProfileId || undefined,
        },
      });

      const repairController = new AbortController();
      taskAbortControllersRef.current.set(taskId, repairController);
      taskAbortReasonsRef.current.delete(taskId);
      const repairTimeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

      let repairResponse;
      try {
        repairResponse = await client.chat([{ role: 'user', content: repairPrompt }], {
          signal: repairController.signal,
        });
      } finally {
        clearTimeout(repairTimeoutId);
        if (taskAbortControllersRef.current.get(taskId) === repairController) {
          taskAbortControllersRef.current.delete(taskId);
        }
      }

      const repairedContent = repairResponse.content || '';
      mergedTokenUsage = mergeCharacterTokenUsage(mergedTokenUsage, repairResponse.tokenUsage);
      updateLogWithResponse(repairLogId, {
        content: repairedContent,
        tokenUsage: repairResponse.tokenUsage,
      });

      const attempt2 = parseCharacterPortraitPrompts(repairedContent);
      if (attempt2.ok) {
        commit(attempt2.value, repairedContent, mergedTokenUsage);
        return;
      }

      throw new Error(`AI 返回缺少定妆照提示词内容：${attempt2.error.reason}`);
    } catch (err) {
      console.error('生成定妆照提示词失败:', err);
      if (isAbortError(err)) {
        const reason = getAbortReason(taskId);
        const msg =
          reason === 'timeout' ? '请求超时（90秒），请检查网络或更换模型后重试。' : '已取消生成';
        cancelTask(taskId);
        if (logId) updateLogWithError(logId, msg);
        return;
      }

      const errorMsg = err instanceof Error ? err.message : '生成定妆照提示词失败，请重试';
      if (logId) updateLogWithError(logId, errorMsg);
      failTask(taskId, {
        message: errorMsg,
        retryable: true,
      });
    } finally {
      taskAbortControllersRef.current.delete(taskId);
      taskAbortReasonsRef.current.delete(taskId);
    }
  };

  const handleBatchGeneratePortraits = useCallback(
    async (characterIds: string[]) => {
      if (!config) {
        setError('请先配置AI服务');
        return;
      }

      const charactersToProcess = projectCharacters
        .filter((c) => characterIds.includes(c.id) && c.appearance && !c.portraitPrompts)
        .filter((c) => !isInProgressTask(portraitTaskByCharacterId.get(c.id)));

      if (charactersToProcess.length === 0) {
        setError('没有可生成的角色（可能已有任务进行中、缺少外观描述或已生成提示词）');
        return;
      }

      setBatchGeneration({
        isProcessing: true,
        isPaused: false,
        currentIndex: 0,
        totalCount: charactersToProcess.length,
        completedIds: [],
        failedIds: [],
        queue: charactersToProcess.map((c) => ({
          characterId: c.id,
          briefDescription: c.briefDescription || c.name,
        })),
      });
      showPanel();

      const client = AIFactory.createClient(config);
      const styleDesc = styleDescription;
      const injectionSettings = getInjectionSettings(projectId);
      const shouldInjectWorldView = shouldInjectAtCharacter(injectionSettings);
      const worldViewForPrompt = shouldInjectWorldView ? projectWorldViewElements : [];
      const artStyleForPrompt =
        currentProject?.artStyleConfig ??
        (currentProject?.style ? migrateOldStyleToConfig(currentProject.style) : undefined);

      for (let i = 0; i < charactersToProcess.length; i++) {
        const character = charactersToProcess[i];

        setBatchGeneration((prev) => ({
          ...prev,
          currentIndex: i + 1,
        }));

        const taskId = addTask({
          type: 'character_portrait',
          title: `批量生成定妆照 [${i + 1}/${charactersToProcess.length}]: ${character.name}`,
          description: `为角色 ${character.name} 生成定妆照提示词`,
          status: 'running',
          priority: 'normal',
          progress: 0,
          projectId,
          characterId: character.id,
          maxRetries: 2,
        });
        let logId = '';
        try {
          const {
            key: portraitPromptKey,
            template: portraitPromptTemplate,
            prompt,
          } = await buildCharacterPortraitPrompt({
            characterName: character.name,
            characterAppearance: character.appearance,
            primaryColor: character.primaryColor?.trim() || undefined,
            secondaryColor: character.secondaryColor?.trim() || undefined,
            artStyle: artStyleForPrompt,
            worldViewElements: worldViewForPrompt,
          });

          logId = logAICall('character_portrait', {
            skillName: CharacterPortraitSkill.name,
            promptTemplate: portraitPromptTemplate,
            filledPrompt: prompt,
            messages: [{ role: 'user', content: prompt }],
            context: {
              projectId,
              characterId: character.id,
              skipProgressBridge: true,
              systemPromptKey: portraitPromptKey,
              characterName: character.name,
              style: styleDesc,
              worldViewInjected: shouldInjectWorldView,
            },
            config: {
              provider: config.provider,
              model: config.model,
              profileId: activeProfileId || undefined,
            },
          });

          updateProgress(taskId, 30, '正在调用AI...');

          const controller = new AbortController();
          taskAbortControllersRef.current.set(taskId, controller);
          taskAbortReasonsRef.current.delete(taskId);
          const timeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

          let response;
          try {
            response = await client.chat([{ role: 'user', content: prompt }], {
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
            if (taskAbortControllersRef.current.get(taskId) === controller) {
              taskAbortControllersRef.current.delete(taskId);
            }
          }

          updateProgress(taskId, 80, '正在解析...');

          const firstResponseContent = response.content || '';
          let mergedTokenUsage = response.tokenUsage;
          updateLogWithResponse(logId, {
            content: firstResponseContent,
            tokenUsage: mergedTokenUsage,
          });

          const attempt1 = parseCharacterPortraitPrompts(firstResponseContent);
          if (attempt1.ok) {
            const preservedReferenceImages = character.portraitPrompts?.referenceImages;
            updateCharacter(projectId, character.id, {
              portraitPrompts: {
                ...attempt1.value,
                ...(preservedReferenceImages ? { referenceImages: preservedReferenceImages } : {}),
              },
            });
            completeTask(taskId, { content: firstResponseContent, tokenUsage: mergedTokenUsage });
            setBatchGeneration((prev) => ({
              ...prev,
              completedIds: [...prev.completedIds, character.id],
            }));
            continue;
          }

          updateTask(taskId, { retryCount: 1 });
          updateProgress(taskId, 60, '输出格式异常，尝试自动修复...');

          const {
            key: jsonRepairPromptKey,
            template: jsonRepairPromptTemplate,
            prompt: repairPrompt,
          } = await buildJsonRepairPrompt({
            requiredKeys: ['midjourney', 'stableDiffusion', 'general'],
            raw: firstResponseContent,
          });

          const repairLogId = logAICall('character_portrait', {
            skillName: CharacterPortraitSkill.name,
            promptTemplate: jsonRepairPromptTemplate,
            filledPrompt: repairPrompt,
            messages: [{ role: 'user', content: repairPrompt }],
            context: {
              projectId,
              characterId: character.id,
              skipProgressBridge: true,
              systemPromptKey: jsonRepairPromptKey,
              characterName: character.name,
              attempt: 2,
              style: styleDesc,
              worldViewInjected: shouldInjectWorldView,
            },
            config: {
              provider: config.provider,
              model: config.model,
              profileId: activeProfileId || undefined,
            },
          });

          const repairController = new AbortController();
          taskAbortControllersRef.current.set(taskId, repairController);
          taskAbortReasonsRef.current.delete(taskId);
          const repairTimeoutId = setTimeout(() => abortTask(taskId, 'timeout'), 90_000);

          let repairResponse;
          try {
            repairResponse = await client.chat([{ role: 'user', content: repairPrompt }], {
              signal: repairController.signal,
            });
          } finally {
            clearTimeout(repairTimeoutId);
            if (taskAbortControllersRef.current.get(taskId) === repairController) {
              taskAbortControllersRef.current.delete(taskId);
            }
          }

          const repairedContent = repairResponse.content || '';
          mergedTokenUsage = mergeCharacterTokenUsage(mergedTokenUsage, repairResponse.tokenUsage);
          updateLogWithResponse(repairLogId, {
            content: repairedContent,
            tokenUsage: repairResponse.tokenUsage,
          });

          const attempt2 = parseCharacterPortraitPrompts(repairedContent);
          if (!attempt2.ok) {
            throw new Error(`AI返回格式错误：${attempt2.error.reason}`);
          }

          const preservedReferenceImages = character.portraitPrompts?.referenceImages;
          updateCharacter(projectId, character.id, {
            portraitPrompts: {
              ...attempt2.value,
              ...(preservedReferenceImages ? { referenceImages: preservedReferenceImages } : {}),
            },
          });
          completeTask(taskId, { content: repairedContent, tokenUsage: mergedTokenUsage });
          setBatchGeneration((prev) => ({
            ...prev,
            completedIds: [...prev.completedIds, character.id],
          }));
        } catch (err) {
          console.error(`批量生成失败 [${character.name}]:`, err);
          failTask(taskId, {
            message: err instanceof Error ? err.message : '生成失败',
            retryable: true,
          });
          if (logId) updateLogWithError(logId, err instanceof Error ? err.message : '生成失败');
          setBatchGeneration((prev) => ({
            ...prev,
            failedIds: [...prev.failedIds, character.id],
          }));
        }

        // 批量操作间添加短暂延迟，避免请求过快
        if (i < charactersToProcess.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      setBatchGeneration((prev) => ({
        ...prev,
        isProcessing: false,
      }));
    },
    [
      activeProfileId,
      addTask,
      abortTask,
      completeTask,
      config,
      currentProject,
      failTask,
      isInProgressTask,
      portraitTaskByCharacterId,
      projectCharacters,
      projectId,
      projectWorldViewElements,
      showPanel,
      styleDescription,
      updateCharacter,
      updateProgress,
      updateTask,
    ],
  );

  // 为所有缺少定妆照的角色批量生成
  const handleBatchGenerateAllMissingPortraits = useCallback(() => {
    const missingPortraitIds = projectCharacters
      .filter((c) => c.appearance && !c.portraitPrompts)
      .filter((c) => !isInProgressTask(portraitTaskByCharacterId.get(c.id)))
      .map((c) => c.id);

    if (missingPortraitIds.length > 0) {
      handleBatchGeneratePortraits(missingPortraitIds);
    } else {
      setError('没有可批量生成的角色（可能已全部生成或已有任务进行中）');
    }
  }, [
    handleBatchGeneratePortraits,
    isInProgressTask,
    portraitTaskByCharacterId,
    projectCharacters,
  ]);

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">角色管理</h2>
            <p className="text-sm text-muted-foreground">管理项目中的所有角色</p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              添加角色
            </Button>
          </DialogTrigger>

          {/* 批量生成定妆照按钮 */}
          {batchPortraitCandidates.length > 0 && (
            <Button
              variant="outline"
              onClick={handleBatchGenerateAllMissingPortraits}
              disabled={batchGeneration.isProcessing || !config}
              className="ml-2"
            >
              {batchGeneration.isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  批量生成中 ({batchGeneration.currentIndex}/{batchGeneration.totalCount})
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  批量生成定妆照 ({batchPortraitCandidates.length})
                </>
              )}
            </Button>
          )}
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingCharacter ? '编辑角色' : '添加新角色'}</DialogTitle>
              <DialogDescription>
                {dialogStep === 'basic'
                  ? '输入角色简短描述，AI将自动生成完整角色卡'
                  : '查看并复制定妆照提示词'}
              </DialogDescription>
            </DialogHeader>

            {!editingCharacter && draftRestored && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <div className="text-muted-foreground">已恢复上次未完成的角色草稿（自动保存）</div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDiscardCreateDraft()}
                  disabled={generatingState !== 'idle'}
                >
                  丢弃草稿
                </Button>
              </div>
            )}

            {/* 步骤指示器 */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${dialogStep === 'basic' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                <Wand2 className="h-3 w-3" />
                1. 基础信息
              </div>
              <div className="h-px w-4 bg-border" />
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${dialogStep === 'portrait' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                <Camera className="h-3 w-3" />
                2. 定妆照提示词
              </div>
            </div>

            <ScrollArea className="max-h-[55vh] pr-4">
              {dialogStep === 'basic' ? (
                <div className="space-y-4">
                  {/* 简短描述输入 */}
                  <div className="space-y-2">
                    <Label htmlFor="briefDescription">角色简短描述 *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="briefDescription"
                        value={formData.briefDescription}
                        onChange={(e) =>
                          setFormData({ ...formData, briefDescription: e.target.value })
                        }
                        placeholder="例如：李明，30岁退役特种兵，沉默寡言"
                        className="flex-1"
                        disabled={generatingState === 'generating_basic'}
                      />
                      <Button
                        onClick={handleGenerateBasicInfo}
                        disabled={generatingState !== 'idle' || !formData.briefDescription.trim()}
                      >
                        {generatingState === 'generating_basic' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            一键生成
                          </>
                        )}
                      </Button>
                      {generatingState === 'generating_basic' && currentTaskId ? (
                        <Button variant="outline" onClick={() => abortCurrentTask('user')}>
                          取消
                        </Button>
                      ) : null}
                      {isDialogPortraitGenerating &&
                      dialogPortraitTask?.id &&
                      generatingState !== 'generating_portrait' ? (
                        <Button variant="outline" size="lg" onClick={showPanel}>
                          查看进度
                        </Button>
                      ) : null}
                      {isDialogPortraitGenerating &&
                      dialogPortraitTask?.id &&
                      generatingState !== 'generating_portrait' &&
                      isAbortableTask(dialogPortraitTask.id) ? (
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => abortTask(dialogPortraitTask.id, 'user')}
                        >
                          取消
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      输入角色名称和特征，AI将自动生成完整的外观、性格和背景
                    </p>
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{error}</div>
                        {(lastAIResponse || lastAIDetails) && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {lastAIResponse ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => void navigator.clipboard.writeText(lastAIResponse)}
                              >
                                复制AI原始返回
                              </Button>
                            ) : null}
                            {lastAIDetails ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => void navigator.clipboard.writeText(lastAIDetails)}
                              >
                                复制解析详情
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 画风提示 */}
                  {currentProject?.style && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-md">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        当前画风：
                        <span className="text-foreground font-medium">{styleLabelText}</span>
                      </span>
                    </div>
                  )}

                  <Separator />

                  {/* 角色名称 */}
                  <div className="space-y-2">
                    <Label htmlFor="name">角色名称</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="AI将自动提取或手动输入"
                    />
                  </div>

                  {/* 外观描述 */}
                  <div className="space-y-2">
                    <Label htmlFor="appearance">外观描述</Label>
                    <Textarea
                      id="appearance"
                      value={formData.appearance}
                      onChange={(e) => setFormData({ ...formData, appearance: e.target.value })}
                      placeholder="年龄、身材、发型、服装等特征..."
                      rows={4}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 性格特点 */}
                  <div className="space-y-2">
                    <Label htmlFor="personality">性格特点</Label>
                    <Textarea
                      id="personality"
                      value={formData.personality}
                      onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                      placeholder="性格特征、情感表达、互动模式..."
                      rows={3}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 背景故事 */}
                  <div className="space-y-2">
                    <Label htmlFor="background">背景故事</Label>
                    <Textarea
                      id="background"
                      value={formData.background}
                      onChange={(e) => setFormData({ ...formData, background: e.target.value })}
                      placeholder="出身、经历、动机、目标..."
                      rows={4}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 角色色彩设置 */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">角色色彩</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {/* 主色 */}
                      <div className="space-y-2">
                        <Label htmlFor="primaryColor" className="text-sm">
                          主色
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="primaryColor"
                            type="color"
                            value={formData.primaryColor || '#6366f1'}
                            onChange={(e) =>
                              setFormData({ ...formData, primaryColor: e.target.value })
                            }
                            className="w-12 h-9 p-1"
                          />
                          <Input
                            value={formData.primaryColor}
                            onChange={(e) =>
                              setFormData({ ...formData, primaryColor: e.target.value })
                            }
                            placeholder="#6366f1"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">角色的主要色彩（服装/发色）</p>
                      </div>
                      {/* 辅色 */}
                      <div className="space-y-2">
                        <Label htmlFor="secondaryColor" className="text-sm">
                          辅色
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="secondaryColor"
                            type="color"
                            value={formData.secondaryColor || '#a855f7'}
                            onChange={(e) =>
                              setFormData({ ...formData, secondaryColor: e.target.value })
                            }
                            className="w-12 h-9 p-1"
                          />
                          <Input
                            value={formData.secondaryColor}
                            onChange={(e) =>
                              setFormData({ ...formData, secondaryColor: e.target.value })
                            }
                            placeholder="#a855f7"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">角色的辅助色彩（配饰/点缀）</p>
                      </div>
                    </div>
                    {/* 色彩预览 */}
                    {(formData.primaryColor || formData.secondaryColor) && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                        <span className="text-xs text-muted-foreground">预览:</span>
                        <div className="flex gap-1">
                          {formData.primaryColor && (
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: formData.primaryColor }}
                              title="主色"
                            />
                          )}
                          {formData.secondaryColor && (
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: formData.secondaryColor }}
                              title="辅色"
                            />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          色彩将传递给AI生成一致的角色外观
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 定妆照提示词步骤 */
                <div className="space-y-4">
                  {/* 角色信息概览 */}
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: formData.themeColor }}
                      >
                        {formData.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-semibold">{formData.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {formData.briefDescription}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{error}</div>
                        {lastAIResponse ? (
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void navigator.clipboard.writeText(lastAIResponse)}
                            >
                              复制AI原始返回
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* 生成定妆照按钮 */}
                  {!hasPortraitPromptText(formData.portraitPrompts) && (
                    <div className="space-y-3">
                      <div className="flex justify-center py-2 gap-2">
                        <Button
                          onClick={handleGeneratePortraitPrompts}
                          disabled={generatingState !== 'idle' || isDialogPortraitGenerating}
                          size="lg"
                        >
                          {generatingState === 'generating_portrait' ||
                          isDialogPortraitGenerating ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              正在生成定妆照提示词...
                            </>
                          ) : (
                            <>
                              <Camera className="h-4 w-4 mr-2" />
                              生成定妆照提示词
                            </>
                          )}
                        </Button>
                        {generatingState === 'generating_portrait' && currentTaskId ? (
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={() => abortCurrentTask('user')}
                          >
                            取消
                          </Button>
                        ) : isDialogPortraitGenerating &&
                          dialogPortraitTask &&
                          isAbortableTask(dialogPortraitTask.id) ? (
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={() => abortTask(dialogPortraitTask.id, 'user')}
                          >
                            取消
                          </Button>
                        ) : null}
                        {isDialogPortraitGenerating ? (
                          <Button variant="outline" size="lg" onClick={showPanel}>
                            查看进度
                          </Button>
                        ) : null}
                      </div>

                      {isDialogPortraitGenerating && dialogPortraitTask ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate">
                              {dialogPortraitTask.currentStep || '正在生成定妆照提示词...'}
                            </span>
                            <span className="text-muted-foreground">
                              {dialogPortraitTask.progress}%
                            </span>
                          </div>
                          <Progress value={dialogPortraitTask.progress} className="h-1.5" />
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* 定妆照提示词展示 */}
                  {hasPortraitPromptText(formData.portraitPrompts) && (
                    <Tabs defaultValue="midjourney" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="midjourney">Midjourney</TabsTrigger>
                        <TabsTrigger value="sd">Stable Diffusion</TabsTrigger>
                        <TabsTrigger value="general">通用</TabsTrigger>
                      </TabsList>

                      <TabsContent value="midjourney" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Midjourney 格式</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleCopyPrompt('mj', formData.portraitPrompts!.midjourney)
                              }
                            >
                              {copiedFormat === 'mj' ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" />
                                  复制
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm font-mono break-all">
                            {formData.portraitPrompts.midjourney}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="sd" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              Stable Diffusion 格式
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleCopyPrompt('sd', formData.portraitPrompts!.stableDiffusion)
                              }
                            >
                              {copiedFormat === 'sd' ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" />
                                  复制
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm font-mono break-all">
                            {formData.portraitPrompts.stableDiffusion}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="general" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">通用格式</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleCopyPrompt('general', formData.portraitPrompts!.general)
                              }
                            >
                              {copiedFormat === 'general' ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  已复制
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" />
                                  复制
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm">
                            {formData.portraitPrompts.general}
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs text-muted-foreground">参考图资产（可多张）</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() =>
                          updatePortraitReferenceImages((prev) => [
                            ...prev,
                            { id: createId('charRef'), url: '', weight: 0.85 },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3" />
                        添加
                      </Button>
                    </div>
                    {portraitReferenceImages.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        （把你生成的白底图/三视图链接贴在这里，后续分镜可直接引用，不用反复写外观描述）
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {portraitReferenceImages.map((ref) => (
                          <div key={ref.id} className="grid gap-2 md:grid-cols-6">
                            <div className="md:col-span-4">
                              <Input
                                value={ref.url}
                                placeholder="粘贴参考图 URL / 文件名"
                                onChange={(e) =>
                                  updatePortraitReferenceImages((prev) =>
                                    prev.map((r) =>
                                      r.id === ref.id ? { ...r, url: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="md:col-span-1">
                              <Input
                                value={ref.weight ?? ''}
                                placeholder="权重"
                                inputMode="decimal"
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  const weight = raw ? clamp01(Number(raw)) : undefined;
                                  updatePortraitReferenceImages((prev) =>
                                    prev.map((r) => (r.id === ref.id ? { ...r, weight } : r)),
                                  );
                                }}
                              />
                            </div>
                            <div className="md:col-span-1 flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() =>
                                  updatePortraitReferenceImages((prev) =>
                                    prev.filter((r) => r.id !== ref.id),
                                  )
                                }
                                title="删除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="md:col-span-6 grid gap-2 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">标签</Label>
                                <Input
                                  value={ref.label ?? ''}
                                  placeholder="例如：front / side / back / expression"
                                  onChange={(e) =>
                                    updatePortraitReferenceImages((prev) =>
                                      prev.map((r) =>
                                        r.id === ref.id ? { ...r, label: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">备注</Label>
                                <Input
                                  value={ref.notes ?? ''}
                                  placeholder="可选：用于下游工具参数/团队协作说明"
                                  onChange={(e) =>
                                    updatePortraitReferenceImages((prev) =>
                                      prev.map((r) =>
                                        r.id === ref.id ? { ...r, notes: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 重新生成按钮 */}
                  {hasPortraitPromptText(formData.portraitPrompts) && (
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGeneratePortraitPrompts}
                        disabled={generatingState !== 'idle' || isDialogPortraitGenerating}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        重新生成
                      </Button>
                      {isDialogPortraitGenerating ? (
                        <Button variant="outline" size="sm" onClick={showPanel}>
                          查看进度
                        </Button>
                      ) : null}
                      {isDialogPortraitGenerating &&
                      dialogPortraitTask &&
                      isAbortableTask(dialogPortraitTask.id) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abortTask(dialogPortraitTask.id, 'user')}
                        >
                          取消
                        </Button>
                      ) : null}
                    </div>
                  )}

                  {/* 画风覆盖提示 */}
                  <div className="p-3 bg-yellow-500/10 rounded-md">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      💡 如需为此角色使用不同画风，可在保存后编辑角色并手动修改提示词
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-between gap-2 pt-4">
              {dialogStep === 'portrait' && (
                <Button variant="outline" onClick={() => setDialogStep('basic')}>
                  返回修改
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleDialogOpenChange(false);
                  }}
                >
                  取消
                </Button>
                {dialogStep === 'basic' ? (
                  <Button
                    onClick={() => {
                      if (formData.appearance.trim()) {
                        setDialogStep('portrait');
                      }
                    }}
                    disabled={!formData.name.trim() || !formData.appearance.trim()}
                  >
                    下一步：生成定妆照
                  </Button>
                ) : (
                  <Button onClick={handleSubmit}>{editingCharacter ? '保存' : '添加角色'}</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              角色关系图谱
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              支持新表 `CharacterRelationship` 与 legacy 字段双写过渡。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGenerateRelationshipGraph()}
            disabled={isGeneratingRelationships || projectCharacters.length < 2}
          >
            {isGeneratingRelationships ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                生成中
              </>
            ) : (
              'AI 生成图谱'
            )}
          </Button>
        </div>
        <CharacterRelationshipGraph
          characters={projectCharacters}
          relationships={characterRelationships}
          height={280}
        />
      </div>

      {/* 角色列表 */}
      {projectCharacters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">还没有角色</h3>
          <p className="text-sm text-muted-foreground mb-4">
            添加角色可以帮助AI更好地理解故事和生成内容
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projectCharacters.map((character) => {
            const portraitTask = portraitTaskByCharacterId.get(character.id);
            const isPortraitGenerating =
              portraitTask?.status === 'running' || portraitTask?.status === 'queued';
            const isPortraitError = portraitTask?.status === 'error';

            return (
              <div
                key={character.id}
                className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow"
              >
                {/* 角色头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: character.themeColor }}
                    >
                      {character.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{character.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {character.appearances.length} 次出场
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(character.id)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(character.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <Separator className="my-3" />

                {/* 角色信息 */}
                <Tabs defaultValue="appearance" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 h-8">
                    <TabsTrigger value="appearance" className="text-xs">
                      外观
                    </TabsTrigger>
                    <TabsTrigger value="personality" className="text-xs">
                      性格
                    </TabsTrigger>
                    <TabsTrigger value="background" className="text-xs">
                      背景
                    </TabsTrigger>
                    <TabsTrigger value="portrait" className="text-xs">
                      定妆照
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="appearance" className="mt-2">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {character.appearance || '暂无外观描述'}
                    </p>
                  </TabsContent>
                  <TabsContent value="personality" className="mt-2">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {character.personality || '暂无性格描述'}
                    </p>
                  </TabsContent>
                  <TabsContent value="background" className="mt-2">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {character.background || '暂无背景故事'}
                    </p>
                  </TabsContent>
                  <TabsContent value="portrait" className="mt-2">
                    {isPortraitGenerating ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">
                            {portraitTask?.currentStep || '正在生成定妆照提示词...'}
                          </span>
                          <span className="text-muted-foreground">
                            {portraitTask?.progress ?? 0}%
                          </span>
                        </div>
                        <Progress value={portraitTask?.progress ?? 0} className="h-1.5" />
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={showPanel}
                          >
                            查看进度
                          </Button>
                          {portraitTask && isAbortableTask(portraitTask.id) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => abortTask(portraitTask.id, 'user')}
                            >
                              取消
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleEdit(character.id)}
                          >
                            编辑
                          </Button>
                        </div>
                      </div>
                    ) : hasPortraitPromptText(character.portraitPrompts) ? (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              handleCopyPrompt(
                                'mj-' + character.id,
                                character.portraitPrompts!.midjourney,
                              )
                            }
                          >
                            {copiedFormat === 'mj-' + character.id ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            MJ
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              handleCopyPrompt(
                                'sd-' + character.id,
                                character.portraitPrompts!.stableDiffusion,
                              )
                            }
                          >
                            {copiedFormat === 'sd-' + character.id ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            SD
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              handleCopyPrompt(
                                'general-' + character.id,
                                character.portraitPrompts!.general,
                              )
                            }
                          >
                            {copiedFormat === 'general-' + character.id ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            通用
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {character.portraitPrompts.general}
                        </p>
                      </div>
                    ) : isPortraitError ? (
                      <div className="space-y-2">
                        <p className="text-xs text-destructive line-clamp-2">
                          {portraitTask?.error?.message || '定妆照提示词生成失败'}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              void handleGeneratePortraitPromptsForCharacter(character)
                            }
                            disabled={!config || !character.appearance}
                          >
                            重试生成
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleEdit(character.id)}
                          >
                            编辑
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                          {character.appearance ? '暂无定妆照提示词' : '请先填写外观描述'}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() =>
                              void handleGeneratePortraitPromptsForCharacter(character)
                            }
                            disabled={!config || !character.appearance}
                          >
                            生成
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => handleEdit(character.id)}
                          >
                            编辑
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* 关系标签 */}
                {character.relationships.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {character.relationships.map((rel, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        <Link2 className="h-3 w-3 mr-1" />
                        {rel.relationshipType}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 级联更新提示对话框 */}
      <AlertDialog open={cascadeDialogOpen} onOpenChange={setCascadeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              角色修改影响分析
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>您修改了角色的关键信息，这可能会影响已生成的分镜内容。</p>
              <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                {cascadeImpactSummary}
              </div>
              <p className="text-xs text-muted-foreground">
                选择“标记更新”将受影响的分镜标记为“需要更新”状态，您可以稍后在分镜细化页面重新生成。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipCascadeUpdate}>跳过</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCascadeUpdate}>标记更新</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
