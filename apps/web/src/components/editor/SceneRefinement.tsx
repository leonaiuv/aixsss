import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  Loader2,
  RotateCw,
  Eye,
  FileText,
  BookOpen,
  Users,
  MessageSquare,
  Copy,
  Maximize2,
  Square,
} from 'lucide-react';
import { AIFactory } from '@/lib/ai/factory';
import { flushScenePatchQueue } from '@/lib/storage';
import { getSkillByName, parseDialoguesFromText } from '@/lib/ai/skills';
import {
  logAICall,
  updateLogWithResponse,
  updateLogWithError,
  updateLogWithCancelled,
  updateLogProgress,
} from '@/lib/ai/debugLogger';
import { fillPromptTemplate, buildCharacterContext } from '@/lib/ai/contextBuilder';
import { shouldInjectAtSceneDescription, getInjectionSettings } from '@/lib/ai/worldViewInjection';
import { generateBGMPrompt, generateTransitionPrompt } from '@/lib/ai/multiModalPrompts';
import {
  checkTokenLimit,
  calculateTotalTokens,
  compressProjectEssence,
} from '@/lib/ai/contextCompressor';
import {
  parseKeyframePromptText,
  parseMotionPromptText,
  parseSceneAnchorText,
} from '@/lib/ai/promptParsers';
import { isStructuredOutput, mergeTokenUsage, requestFormatFix } from '@/lib/ai/outputFixer';
import {
  migrateOldStyleToConfig,
  DIALOGUE_TYPE_LABELS,
  type Project,
  type Scene,
  type SceneStep,
} from '@/types';
import { TemplateGallery } from './TemplateGallery';
import { useConfirm } from '@/hooks/use-confirm';
import {
  useKeyboardShortcut,
  GLOBAL_SHORTCUTS,
  getPlatformShortcut,
} from '@/hooks/useKeyboardShortcut';

/**
 * 获取项目的完整画风提示词
 */
function getStyleFullPrompt(project: Project | null): string {
  if (!project) return '';
  if (project.artStyleConfig?.fullPrompt) {
    return project.artStyleConfig.fullPrompt;
  }
  if (project.style) {
    return migrateOldStyleToConfig(project.style).fullPrompt;
  }
  return '';
}

function getRecommendedAccordionValue(
  scene:
    | {
        sceneDescription?: string;
        shotPrompt?: string;
        motionPrompt?: string;
        dialogues?: unknown[];
      }
    | undefined,
): string {
  if (!scene?.sceneDescription) return 'scene';
  if (!scene.shotPrompt) return 'keyframe';
  if (!scene.motionPrompt) return 'motion';
  if (!scene.dialogues || scene.dialogues.length === 0) return 'dialogue';
  return 'dialogue';
}

type PromptEditorField = 'sceneDescription' | 'shotPrompt' | 'motionPrompt';

type PromptEditorState =
  | { kind: 'field'; field: PromptEditorField; title: string }
  | { kind: 'preview'; title: string; value: string };

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

export function SceneRefinement() {
  const { currentProject, updateProject } = useProjectStore();
  const projectId = currentProject?.id ?? null;
  const currentProjectSceneOrder = currentProject?.currentSceneOrder || 1;
  const {
    scenes,
    updateScene,
    loadScenes,
    skipSteps,
    manualOverrides,
    setSceneSkipSteps,
    setSceneManualOverrides,
  } = useStoryboardStore();
  const { config, activeProfileId } = useConfigStore();
  const { characters } = useCharacterStore();
  const { elements: worldViewElements, loadElements: loadWorldViewElements } = useWorldViewStore();
  const {
    isBatchGenerating: isGlobalBatchGenerating,
    batchGeneratingSource,
    startBatchGenerating,
    stopBatchGenerating,
  } = useAIProgressStore();
  const { toast } = useToast();

  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const generateAllRunningRef = useRef(false);

  const requestCancel = useCallback(() => {
    cancelRequestedRef.current = true;
    abortControllerRef.current?.abort();
    toast({ title: '已请求取消', description: '正在停止本次生成...' });
  }, [toast]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<SceneStep | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [error, setError] = useState('');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [isDataReady, setIsDataReady] = useState(() => {
    if (!currentProject) return false;
    if (scenes.length === 0) return false;
    return scenes.every((scene) => scene.projectId === currentProject.id);
  });
  const [sceneListDialogOpen, setSceneListDialogOpen] = useState(false);
  const [sceneListQuery, setSceneListQuery] = useState('');
  const [sceneListFilter, setSceneListFilter] = useState<
    'all' | 'incomplete' | 'completed' | 'needs_update'
  >('all');
  const [activeAccordion, setActiveAccordion] = useState<string>('scene');
  const [promptEditor, setPromptEditor] = useState<PromptEditorState | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

  // 关键帧提示词解析（用于拆分 KF0/KF1/KF2 的快速复制）
  const currentSceneForParse = scenes[currentSceneIndex];
  const currentSceneId = currentSceneForParse?.id;
  const parsedSceneAnchor = useMemo(
    () => parseSceneAnchorText(currentSceneForParse?.sceneDescription || ''),
    [currentSceneForParse?.sceneDescription],
  );
  const parsedKeyframes = useMemo(
    () => parseKeyframePromptText(currentSceneForParse?.shotPrompt || ''),
    [currentSceneForParse?.shotPrompt],
  );
  const parsedMotion = useMemo(
    () => parseMotionPromptText(currentSceneForParse?.motionPrompt || ''),
    [currentSceneForParse?.motionPrompt],
  );

  const filteredSceneList = useMemo(() => {
    const query = sceneListQuery.trim().toLowerCase();
    return scenes
      .map((scene, index) => {
        const isFullyCompleted = scene.status === 'completed' && Boolean(scene.dialogues?.length);
        const isNeedsUpdate = scene.status === 'needs_update';
        const isIncomplete = !isFullyCompleted;
        return { scene, index, isFullyCompleted, isNeedsUpdate, isIncomplete };
      })
      .filter(({ scene, isFullyCompleted, isNeedsUpdate, isIncomplete }) => {
        if (sceneListFilter === 'completed' && !isFullyCompleted) return false;
        if (sceneListFilter === 'needs_update' && !isNeedsUpdate) return false;
        if (sceneListFilter === 'incomplete' && !isIncomplete) return false;
        if (!query) return true;
        return (scene.summary || '').toLowerCase().includes(query);
      });
  }, [sceneListFilter, sceneListQuery, scenes]);

  // 使用 useMemo 优化项目角色列表过滤
  const projectCharacters = useMemo(
    () => characters.filter((c) => c.projectId === currentProject?.id),
    [characters, currentProject?.id],
  );

  // 缓存进度计算 - 必须在条件返回之前调用 hooks
  const progress = useMemo(() => {
    if (scenes.length === 0) return 0;
    return Math.round(((currentSceneIndex + 1) / scenes.length) * 100);
  }, [currentSceneIndex, scenes.length]);
  const currentScene = scenes[currentSceneIndex];
  const selectedCastIds = useMemo(
    () => currentScene?.castCharacterIds ?? [],
    [currentScene?.castCharacterIds],
  );
  const selectedCastIdSet = useMemo(() => new Set(selectedCastIds), [selectedCastIds]);
  const castCharacters = useMemo(() => {
    if (!currentScene?.castCharacterIds?.length) return [];
    const selected = new Set(currentScene.castCharacterIds);
    return projectCharacters.filter((character) => selected.has(character.id));
  }, [currentScene?.castCharacterIds, projectCharacters]);

  // 使用 useCallback 优化导航回调 - 必须在条件返回之前
  const goToPrevScene = useCallback(() => {
    if (currentSceneIndex <= 0 || !projectId) return;
    try {
      flushScenePatchQueue();
    } catch {}
    setCurrentSceneIndex(currentSceneIndex - 1);
    updateProject(projectId, { currentSceneOrder: currentSceneIndex });
  }, [currentSceneIndex, projectId, updateProject]);

  const goToNextScene = useCallback(() => {
    if (currentSceneIndex >= scenes.length - 1 || !projectId) return;
    try {
      flushScenePatchQueue();
    } catch {}
    setCurrentSceneIndex(currentSceneIndex + 1);
    updateProject(projectId, { currentSceneOrder: currentSceneIndex + 2 });
  }, [currentSceneIndex, scenes.length, projectId, updateProject]);

  const goToScene = useCallback(
    (index: number) => {
      if (!projectId) return;
      const safeIndex = Math.max(0, Math.min(index, scenes.length - 1));
      try {
        flushScenePatchQueue();
      } catch {}
      setCurrentSceneIndex(safeIndex);
      updateProject(projectId, { currentSceneOrder: safeIndex + 1 });
    },
    [projectId, scenes.length, updateProject],
  );

  const loadScenesRef = useRef(loadScenes);
  useEffect(() => {
    loadScenesRef.current = loadScenes;
  }, [loadScenes]);

  const loadWorldViewElementsRef = useRef(loadWorldViewElements);
  useEffect(() => {
    loadWorldViewElementsRef.current = loadWorldViewElements;
  }, [loadWorldViewElements]);

  // 快捷键
  useKeyboardShortcut('ctrl+arrowleft', handleShortcutPrevScene);
  useKeyboardShortcut('ctrl+arrowright', handleShortcutNextScene);
  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.GENERATE, GLOBAL_SHORTCUTS.GENERATE_MAC),
    handleShortcutGenerate,
  );

  useEffect(() => {
    if (!projectId) return;
    setIsDataReady(false);
    loadScenesRef.current(projectId);
    loadWorldViewElementsRef.current(projectId);
    setIsDataReady(true);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setCurrentSceneIndex(Math.max(0, currentProjectSceneOrder - 1));
  }, [currentProjectSceneOrder, projectId]);

  // 防止索引越界（例如分镜数量变化/数据迁移导致的 order 不合法）
  useEffect(() => {
    if (scenes.length === 0) return;
    if (currentSceneIndex < 0) {
      setCurrentSceneIndex(0);
      return;
    }
    if (currentSceneIndex > scenes.length - 1) {
      setCurrentSceneIndex(scenes.length - 1);
    }
  }, [currentSceneIndex, scenes.length]);

  useEffect(() => {
    if (!projectId) return;
    if (!currentSceneId) return;

    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find((s) => s.id === currentSceneId);
    if (!latestScene) return;

    setActiveAccordion(getRecommendedAccordionValue(latestScene));
  }, [projectId, currentSceneId]);

  // 数据加载中：避免首屏空白
  if (!currentProject) {
    return (
      <Card className="p-8">
        <p className="text-muted-foreground">请先选择或创建一个项目</p>
      </Card>
    );
  }

  if (!isDataReady) {
    return (
      <Card className="p-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>正在加载分镜数据...</span>
        </div>
      </Card>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="p-8">
          <h2 className="text-2xl font-bold mb-2">分镜细化</h2>
          <p className="text-sm text-muted-foreground mb-6">
            还没有分镜数据，请先在“分镜生成”步骤创建分镜列表。
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                updateProject(currentProject.id, { workflowState: 'SCENE_LIST_EDITING' })
              }
              className="gap-2"
            >
              <BookOpen className="h-4 w-4" />
              <span>去生成分镜</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => updateProject(currentProject.id, { workflowState: 'DATA_COLLECTED' })}
            >
              返回基础设定
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentSkipSteps = currentScene ? (skipSteps[currentScene.id] ?? {}) : {};
  const currentManualOverrides = currentScene ? (manualOverrides[currentScene.id] ?? {}) : {};
  const promptEditorValue =
    promptEditor?.kind === 'field'
      ? (currentScene?.[promptEditor.field] ?? '')
      : (promptEditor?.value ?? '');

  const applyManualSceneDescription = (manualValue?: string) => {
    if (!currentProject || !currentScene) return;
    const content = manualValue?.trim() ?? currentScene.sceneDescription?.trim() ?? '';
    if (!content) {
      setError('请先填写手动场景锚点内容，再启用跳过。');
      return;
    }
    updateScene(currentProject.id, currentScene.id, {
      sceneDescription: content,
      status: 'scene_confirmed',
    });
    setActiveAccordion('keyframe');
  };

  const applyManualShotPrompt = (manualValue?: string) => {
    if (!currentProject || !currentScene) return;
    const content = manualValue?.trim() ?? currentScene.shotPrompt?.trim() ?? '';
    if (!content) {
      setError('请先填写手动关键帧提示词内容，再启用跳过。');
      return;
    }
    updateScene(currentProject.id, currentScene.id, {
      shotPrompt: content,
      status: 'keyframe_confirmed',
    });
    setActiveAccordion('motion');
  };

  // 生成场景锚点
  const generateSceneDescription = async () => {
    if (!currentScene) return;
    if (currentSkipSteps.sceneDescription) {
      applyManualSceneDescription(currentManualOverrides.sceneDescription);
      return;
    }
    if (!config) return;

    cancelRequestedRef.current = false;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setGeneratingStep('scene_description');
    setError('');
    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_scene_desc');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      // 获取完整画风提示词
      const styleFullPrompt = getStyleFullPrompt(currentProject);

      // 获取世界观注入设置
      const injectionSettings = getInjectionSettings(currentProject.id);
      const shouldInjectWorldView = shouldInjectAtSceneDescription(injectionSettings);

      // 使用 contextBuilder 填充模板
      const prompt = fillPromptTemplate(skill.promptTemplate, {
        artStyle: currentProject.artStyleConfig,
        characters: projectCharacters,
        worldViewElements: shouldInjectWorldView ? worldViewElements : [],
        protagonist: currentProject.protagonist,
        sceneSummary: currentScene.summary,
        prevSceneSummary: currentSceneIndex > 0 ? scenes[currentSceneIndex - 1].summary : undefined,
        summary: currentProject.summary,
      });

      // 检查 Token 使用情况
      const tokenEstimate = calculateTotalTokens({ task: prompt });
      const tokenCheck = checkTokenLimit(tokenEstimate, 4000);
      console.log(
        `[上下文压缩] Token估算: ${tokenEstimate}, 使用率: ${tokenCheck.usage.toFixed(1)}%`,
      );

      // 如果接近限制，使用压缩策略
      if (tokenCheck.usage > 70) {
        const compressed = compressProjectEssence(currentProject, 'balanced');
        console.log(`[上下文压缩] 已压缩项目信息: ${compressed.tokens} tokens`);
      }

      // 记录AI调用日志
      const prevSceneSummary =
        currentSceneIndex > 0 ? scenes[currentSceneIndex - 1].summary : undefined;
      logId = logAICall('scene_description', {
        skillName: skill.name,
        promptTemplate: skill.promptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId: currentProject.id,
          style: styleFullPrompt,
          protagonist: currentProject.protagonist,
          summary: currentProject.summary,
          sceneId: currentScene.id,
          sceneOrder: currentSceneIndex + 1,
          sceneSummary: currentScene.summary,
          prevSceneSummary,
          worldViewInjected: shouldInjectWorldView,
        },
        config: {
          provider: config.provider,
          model: config.model,
          maxTokens: skill.maxTokens,
          profileId: activeProfileId || undefined,
        },
      });

      updateLogProgress(logId, 30, '正在生成场景锚点...');

      const response = await client.chat([{ role: 'user', content: prompt }], {
        signal: abortController.signal,
      });

      let finalContent = response.content.trim();
      let mergedTokenUsage = response.tokenUsage;

      updateLogProgress(logId, 60, '正在检查输出格式...');

      if (finalContent && !isStructuredOutput('scene_anchor', finalContent)) {
        updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
        try {
          const fixed = await requestFormatFix({
            chat: (messages, options) => client.chat(messages, options),
            type: 'scene_anchor',
            raw: finalContent,
            signal: abortController.signal,
          });

          mergedTokenUsage = mergeTokenUsage(mergedTokenUsage, fixed.tokenUsage);

          const fixedContent = fixed.content.trim();
          if (fixedContent && isStructuredOutput('scene_anchor', fixedContent)) {
            finalContent = fixedContent;
            updateLogProgress(logId, 75, '纠偏完成，正在保存结果...');
          } else {
            updateLogProgress(logId, 75, '纠偏未生效，正在保存原始输出...');
          }
        } catch (fixError) {
          if (isAbortError(fixError)) throw fixError;
          console.warn('场景锚点输出纠偏失败，已回退到原始输出:', fixError);
          updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
        }
      }

      updateLogProgress(logId, 80, '正在保存结果...');

      // 更新日志响应（Token 口径：若发生纠偏，则合并两次调用的 tokenUsage）
      updateLogWithResponse(logId, {
        content: finalContent,
        tokenUsage: mergedTokenUsage,
      });

      updateScene(currentProject.id, currentScene.id, {
        sceneDescription: finalContent,
        status: 'scene_confirmed',
      });
      setActiveAccordion('keyframe');
    } catch (err) {
      if (isAbortError(err)) {
        if (logId) updateLogWithCancelled(logId);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成场景锚点失败:', err);
      if (logId) updateLogWithError(logId, errorMsg);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成关键帧提示词（KF0/KF1/KF2）
  const generateKeyframePrompt = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find((s) => s.id === currentScene?.id);

    if (currentSkipSteps.shotPrompt) {
      applyManualShotPrompt(currentManualOverrides.shotPrompt);
      return;
    }
    if (!config || !latestScene || !latestScene.sceneDescription) return;

    cancelRequestedRef.current = false;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setGeneratingStep('keyframe_prompt');
    setError('');
    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_keyframe_prompt');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      const styleFullPrompt = getStyleFullPrompt(currentProject);

      // 使用 contextBuilder 填充模板
      const prompt = fillPromptTemplate(skill.promptTemplate, {
        artStyle: currentProject.artStyleConfig,
        characters: castCharacters,
        protagonist: currentProject.protagonist,
        sceneDescription: latestScene.sceneDescription,
        sceneSummary: latestScene.summary,
        prevSceneSummary: currentSceneIndex > 0 ? scenes[currentSceneIndex - 1].summary : undefined,
      });

      // 记录AI调用日志
      logId = logAICall('keyframe_prompt', {
        skillName: skill.name,
        promptTemplate: skill.promptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId: currentProject.id,
          style: styleFullPrompt,
          protagonist: currentProject.protagonist,
          sceneId: latestScene.id,
          sceneOrder: currentSceneIndex + 1,
          sceneDescription: latestScene.sceneDescription,
        },
        config: {
          provider: config.provider,
          model: config.model,
          maxTokens: skill.maxTokens,
          profileId: activeProfileId || undefined,
        },
      });

      updateLogProgress(logId, 30, '正在生成关键帧提示词（KF0/KF1/KF2）...');

      const response = await client.chat([{ role: 'user', content: prompt }], {
        signal: abortController.signal,
      });

      let finalContent = response.content.trim();
      let mergedTokenUsage = response.tokenUsage;

      updateLogProgress(logId, 60, '正在检查输出格式...');

      if (finalContent && !isStructuredOutput('keyframe_prompt', finalContent)) {
        updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
        try {
          const fixed = await requestFormatFix({
            chat: (messages, options) => client.chat(messages, options),
            type: 'keyframe_prompt',
            raw: finalContent,
            signal: abortController.signal,
          });

          mergedTokenUsage = mergeTokenUsage(mergedTokenUsage, fixed.tokenUsage);

          const fixedContent = fixed.content.trim();
          if (fixedContent && isStructuredOutput('keyframe_prompt', fixedContent)) {
            finalContent = fixedContent;
            updateLogProgress(logId, 75, '纠偏完成，正在保存关键帧...');
          } else {
            updateLogProgress(logId, 75, '纠偏未生效，正在保存原始输出...');
          }
        } catch (fixError) {
          if (isAbortError(fixError)) throw fixError;
          console.warn('关键帧输出纠偏失败，已回退到原始输出:', fixError);
          updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
        }
      }

      updateLogProgress(logId, 80, '正在保存关键帧...');

      // 更新日志响应（Token 口径：若发生纠偏，则合并两次调用的 tokenUsage）
      updateLogWithResponse(logId, {
        content: finalContent,
        tokenUsage: mergedTokenUsage,
      });

      updateScene(currentProject.id, latestScene.id, {
        shotPrompt: finalContent,
        status: 'keyframe_confirmed',
      });
      setActiveAccordion('motion');
    } catch (err) {
      if (isAbortError(err)) {
        if (logId) updateLogWithCancelled(logId);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成关键帧提示词（KF0/KF1/KF2）失败:', err);
      if (logId) updateLogWithError(logId, errorMsg);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成时空/运动提示词
  const generateMotionPrompt = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find((s) => s.id === currentScene?.id);

    if (!config || !latestScene || !latestScene.shotPrompt) return;

    cancelRequestedRef.current = false;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setGeneratingStep('motion_prompt');
    setError('');
    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_motion_prompt');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      const prompt = fillPromptTemplate(skill.promptTemplate, {
        artStyle: currentProject.artStyleConfig,
        characters: projectCharacters,
        sceneSummary: latestScene.summary,
        sceneDescription: latestScene.sceneDescription,
        shotPrompt: latestScene.shotPrompt,
      });

      // 记录AI调用日志
      logId = logAICall('motion_prompt', {
        skillName: skill.name,
        promptTemplate: skill.promptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId: currentProject.id,
          sceneId: latestScene.id,
          sceneOrder: currentSceneIndex + 1,
          sceneDescription: latestScene.sceneDescription,
        },
        config: {
          provider: config.provider,
          model: config.model,
          maxTokens: skill.maxTokens,
          profileId: activeProfileId || undefined,
        },
      });

      updateLogProgress(logId, 30, '正在生成时空/运动提示词...');

      const response = await client.chat([{ role: 'user', content: prompt }], {
        signal: abortController.signal,
      });

      let finalContent = response.content.trim();
      let mergedTokenUsage = response.tokenUsage;

      updateLogProgress(logId, 60, '正在检查输出格式...');

      if (finalContent && !isStructuredOutput('motion_prompt', finalContent)) {
        updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
        try {
          const fixed = await requestFormatFix({
            chat: (messages, options) => client.chat(messages, options),
            type: 'motion_prompt',
            raw: finalContent,
            signal: abortController.signal,
          });

          mergedTokenUsage = mergeTokenUsage(mergedTokenUsage, fixed.tokenUsage);

          const fixedContent = fixed.content.trim();
          if (fixedContent && isStructuredOutput('motion_prompt', fixedContent)) {
            finalContent = fixedContent;
            updateLogProgress(logId, 75, '纠偏完成，正在保存结果...');
          } else {
            updateLogProgress(logId, 75, '纠偏未生效，正在保存原始输出...');
          }
        } catch (fixError) {
          if (isAbortError(fixError)) throw fixError;
          console.warn('时空/运动提示词输出纠偏失败，已回退到原始输出:', fixError);
          updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
        }
      }

      updateLogProgress(logId, 80, '正在保存结果...');

      // 更新日志响应（Token 口径：若发生纠偏，则合并两次调用的 tokenUsage）
      updateLogWithResponse(logId, {
        content: finalContent,
        tokenUsage: mergedTokenUsage,
      });

      updateScene(currentProject.id, latestScene.id, {
        motionPrompt: finalContent,
        status: 'motion_generating',
      });
      setActiveAccordion('dialogue');
    } catch (err) {
      if (isAbortError(err)) {
        if (logId) updateLogWithCancelled(logId);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成时空/运动提示词失败:', err);
      if (logId) updateLogWithError(logId, errorMsg);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成台词
  const generateDialogue = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find((s) => s.id === currentScene?.id);

    if (!config || !latestScene || !latestScene.motionPrompt) return;

    cancelRequestedRef.current = false;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsGenerating(true);
    setGeneratingStep('dialogue');
    setError('');
    let logId = '';

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_dialogue');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      // 使用 contextBuilder 构建角色上下文
      const characterContext = buildCharacterContext(castCharacters);

      // 使用 fillPromptTemplate 填充模板
      const prompt = fillPromptTemplate(skill.promptTemplate, {
        characters: castCharacters,
        sceneSummary: latestScene.summary,
        sceneDescription: latestScene.sceneDescription,
        shotPrompt: latestScene.shotPrompt,
        motionPrompt: latestScene.motionPrompt,
      });

      // 记录AI调用日志
      logId = logAICall('dialogue', {
        skillName: skill.name,
        promptTemplate: skill.promptTemplate,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId: currentProject.id,
          sceneId: latestScene.id,
          sceneOrder: currentSceneIndex + 1,
          sceneSummary: latestScene.summary,
          sceneDescription: latestScene.sceneDescription,
          characters: characterContext,
        },
        config: {
          provider: config.provider,
          model: config.model,
          maxTokens: skill.maxTokens,
          profileId: activeProfileId || undefined,
        },
      });

      updateLogProgress(logId, 30, '正在生成台词...');

      const response = await client.chat([{ role: 'user', content: prompt }], {
        signal: abortController.signal,
      });

      updateLogProgress(logId, 80, '正在解析台词...');

      // 更新日志响应
      updateLogWithResponse(logId, {
        content: response.content,
        tokenUsage: response.tokenUsage,
      });

      // 解析台词文本
      const dialogues = parseDialoguesFromText(response.content);

      updateScene(currentProject.id, latestScene.id, {
        dialogues,
        status: 'completed',
      });
      setActiveAccordion('dialogue');

      const { scenes: scenesAfter } = useStoryboardStore.getState();
      const isAllScenesComplete = scenesAfter.every(
        (scene) => scene.status === 'completed' && (scene.dialogues?.length ?? 0) > 0,
      );

      if (isAllScenesComplete) {
        updateProject(currentProject.id, {
          workflowState: 'ALL_SCENES_COMPLETE',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (logId) updateLogWithCancelled(logId);
        return;
      }
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成台词失败:', err);
      if (logId) updateLogWithError(logId, errorMsg);
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 一键生成全部 - 优化版本
  const generateAll = async (forceRegenerate = false) => {
    // 防止重复触发或被外部批量操作阻止
    if (generateAllRunningRef.current || isBatchGenerating || isGenerating || isExternallyBlocked) {
      return;
    }

    generateAllRunningRef.current = true;
    setIsBatchGenerating(true);
    startBatchGenerating('scene_refinement');
    setError('');
    cancelRequestedRef.current = false;

    try {
      // 如果是强制重新生成，先重置场景状态
      if (forceRegenerate && currentProject) {
        updateScene(currentProject.id, currentScene.id, {
          sceneDescription: '',
          shotPrompt: '',
          motionPrompt: '',
          dialogues: [],
          status: 'pending',
        });
        setActiveAccordion('scene');
        // 等待状态更新
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (cancelRequestedRef.current) return;
      }

      // 第一阶段：生成场景锚点
      const { scenes: currentScenes } = useStoryboardStore.getState();
      const scene0 = currentScenes.find((s) => s.id === currentScene.id);
      if (!scene0?.sceneDescription) {
        setGeneratingStep('scene_description');
        if (currentSkipSteps.sceneDescription) {
          applyManualSceneDescription(currentManualOverrides.sceneDescription);
        } else {
          await generateSceneDescription();
        }
        if (cancelRequestedRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelRequestedRef.current) return;
      }

      // 获取最新场景数据
      const { scenes: updatedScenes1 } = useStoryboardStore.getState();
      const latestScene1 = updatedScenes1.find((s) => s.id === currentScene.id);

      if (!latestScene1?.sceneDescription) {
        throw new Error('场景锚点生成失败');
      }

      // 第二阶段：生成关键帧提示词（KF0/KF1/KF2）
      if (!latestScene1.shotPrompt) {
        setGeneratingStep('keyframe_prompt');
        if (currentSkipSteps.shotPrompt) {
          applyManualShotPrompt(currentManualOverrides.shotPrompt);
        } else {
          await generateKeyframePrompt();
        }
        if (cancelRequestedRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelRequestedRef.current) return;
      }

      // 获取最新场景数据
      const { scenes: updatedScenes2 } = useStoryboardStore.getState();
      const latestScene2 = updatedScenes2.find((s) => s.id === currentScene.id);

      if (!latestScene2?.shotPrompt) {
        throw new Error('关键帧提示词（KF0/KF1/KF2）生成失败');
      }

      // 第三阶段：生成时空/运动提示词
      if (!latestScene2.motionPrompt) {
        setGeneratingStep('motion_prompt');
        await generateMotionPrompt();
        if (cancelRequestedRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (cancelRequestedRef.current) return;
      }

      // 获取最新场景数据
      const { scenes: updatedScenes3 } = useStoryboardStore.getState();
      const latestScene3 = updatedScenes3.find((s) => s.id === currentScene.id);

      if (!latestScene3?.motionPrompt) {
        throw new Error('时空/运动提示词生成失败');
      }

      // 第四阶段：生成台词（可用于字幕/配音）
      if (!latestScene3.dialogues || latestScene3.dialogues.length === 0) {
        setGeneratingStep('dialogue');
        await generateDialogue();
        if (cancelRequestedRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '一键生成失败';
      setError(errorMessage);
      console.error('一键生成全部失败:', err);
    } finally {
      generateAllRunningRef.current = false;
      setIsBatchGenerating(false);
      stopBatchGenerating();
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  const canGenerateScene = !currentScene.sceneDescription;
  const canGenerateKeyframe = currentScene.sceneDescription && !currentScene.shotPrompt;
  const canGenerateMotion = currentScene.shotPrompt && !currentScene.motionPrompt;
  const canGenerateDialogue =
    currentScene.motionPrompt && (!currentScene.dialogues || currentScene.dialogues.length === 0);
  const hasDialogues = currentScene.dialogues && currentScene.dialogues.length > 0;
  const isCompleted = currentScene.status === 'completed' && hasDialogues;
  const isAllScenesComplete = scenes.every(
    (scene) => scene.status === 'completed' && (scene.dialogues?.length ?? 0) > 0,
  );

  // 检查是否被外部批量操作禁用（如批量面板/单集工作流正在批量执行）
  const isExternallyBlocked =
    isGlobalBatchGenerating && batchGeneratingSource !== 'scene_refinement';
  const externalBlockMessage = isExternallyBlocked ? '批量操作正在进行中，请等待完成' : '';

  function handleShortcutPrevScene() {
    if (isGenerating || isBatchGenerating || isExternallyBlocked) return;
    goToPrevScene();
  }

  function handleShortcutNextScene() {
    if (isGenerating || isBatchGenerating || isExternallyBlocked) return;
    if (currentSceneIndex >= scenes.length - 1) return;
    goToNextScene();
  }

  function handleShortcutGenerate() {
    if (isGenerating || isBatchGenerating || isExternallyBlocked) return;
    if (!config) {
      toast({
        title: '配置缺失',
        description: '请先配置AI服务（右上角设置）',
        variant: 'destructive',
      });
      return;
    }

    if (canGenerateScene) {
      void generateSceneDescription();
      return;
    }
    if (canGenerateKeyframe) {
      void generateKeyframePrompt();
      return;
    }
    if (canGenerateMotion) {
      void generateMotionPrompt();
      return;
    }
    if (canGenerateDialogue) {
      void generateDialogue();
      return;
    }

    toast({
      title: '无需生成',
      description: '当前分镜已完成或暂无可生成的阶段',
    });
  }

  const copyToClipboard = (text: string, title: string, description?: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast({ title, description });
      },
      () => {
        toast({
          title: '复制失败',
          description: '浏览器未授予剪贴板权限',
          variant: 'destructive',
        });
      },
    );
  };

  const openPromptEditor = (field: PromptEditorField, title: string) => {
    setPromptEditor({ kind: 'field', field, title });
  };

  const openPromptPreview = (title: string, value: string) => {
    setPromptEditor({ kind: 'preview', title, value });
  };

  // 应用模板
  const handleApplyTemplate = (template: string, variables: Record<string, string>) => {
    let content = template;
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    // 应用到当前分镜的场景锚点
    if (currentScene) {
      updateScene(currentProject!.id, currentScene.id, {
        sceneDescription: content,
        status: 'scene_confirmed',
      });
    }
    setTemplateDialogOpen(false);
  };

  // 复制角色信息（用于粘贴到关键帧/台词备注等）
  const handleCharacterSelect = (character: (typeof projectCharacters)[0]) => {
    const characterInfo = `角色: ${character.name}
外观: ${character.appearance || '(未填写)'}
性格: ${character.personality || '(未填写)'}`;

    copyToClipboard(characterInfo, '已复制角色信息', '可粘贴到关键帧提示词或台词备注中');
    setCharacterDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      {/* 全屏编辑器（提升长文本编辑体验） */}
      <Dialog
        open={Boolean(promptEditor)}
        onOpenChange={(open) => {
          if (!open) setPromptEditor(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] grid-rows-[auto,1fr,auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{promptEditor?.title || '编辑'}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0">
            <Textarea
              value={promptEditorValue}
              onChange={(e) => {
                if (!promptEditor || promptEditor.kind !== 'field' || !currentScene) return;
                updateScene(currentProject.id, currentScene.id, {
                  [promptEditor.field]: e.target.value,
                } as Partial<Scene>);
              }}
              readOnly={!promptEditor || promptEditor.kind !== 'field'}
              className="h-full min-h-0 resize-none font-mono text-sm leading-relaxed"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>字数：{promptEditorValue.length.toLocaleString()}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(promptEditorValue, '已复制内容')}
              disabled={!promptEditorValue.trim()}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              <span>复制</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="p-8">
        {/* 头部导航 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">分镜细化</h2>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <span>
                {currentSceneIndex + 1} / {scenes.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 模板库按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplateDialogOpen(true)}
              className="gap-2"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">使用模板</span>
            </Button>
            {/* 复制角色信息按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCharacterDialogOpen(true)}
              disabled={projectCharacters.length === 0}
              className="gap-2"
              title={
                projectCharacters.length === 0
                  ? '请先在基础设定中添加角色'
                  : '复制角色信息（用于粘贴到关键帧/台词）'
              }
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">复制角色</span>
              {projectCharacters.length === 0 && (
                <span className="text-xs text-muted-foreground">(无角色)</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSceneListDialogOpen(true)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">分镜列表</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevScene}
              disabled={
                currentSceneIndex === 0 || isGenerating || isBatchGenerating || isExternallyBlocked
              }
              title={
                isExternallyBlocked
                  ? externalBlockMessage
                  : isGenerating || isBatchGenerating
                    ? '生成进行中，暂不可切换分镜'
                    : ''
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextScene}
              disabled={
                currentSceneIndex === scenes.length - 1 ||
                isGenerating ||
                isBatchGenerating ||
                isExternallyBlocked
              }
              title={
                isExternallyBlocked
                  ? externalBlockMessage
                  : isGenerating || isBatchGenerating
                    ? '生成进行中，暂不可切换分镜'
                    : ''
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {(isGenerating || isBatchGenerating) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={requestCancel}
                className="gap-2"
                title="取消当前AI生成"
              >
                <Square className="h-4 w-4" />
                <span className="hidden sm:inline">取消生成</span>
              </Button>
            )}
          </div>
        </div>

        {/* 进度条 */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>整体进度</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* 需要更新提示 */}
        {currentScene.status === 'needs_update' && (
          <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span>该分镜受角色/世界观修改影响，建议重新生成内容</span>
            </p>
          </div>
        )}

        {/* 分镜概要 */}
        <div className="mb-6 p-4 rounded-lg bg-muted/50">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
              {currentSceneIndex + 1}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">分镜概要</h3>
              <p className="text-sm text-muted-foreground">{currentScene.summary}</p>
            </div>
            {isCompleted && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-600 text-xs font-medium">
                <Check className="h-3 w-3" />
                <span>已完成</span>
              </div>
            )}
          </div>
        </div>

        {/* 出场角色选择 */}
        <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold mb-1">出场角色</h3>
              <p className="text-xs text-muted-foreground">
                勾选本分镜出场角色，仅会注入所选角色到关键帧/台词提示词。
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              已选 {selectedCastIds.length} / {projectCharacters.length}
            </div>
          </div>
          {projectCharacters.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无角色，请先在基础设定中创建角色。</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projectCharacters.map((character) => (
                <label
                  key={character.id}
                  className="flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selectedCastIdSet.has(character.id)}
                    onCheckedChange={(checked) => {
                      if (!currentProject || !currentScene) return;
                      const next = new Set(currentScene.castCharacterIds ?? []);
                      if (checked) {
                        next.add(character.id);
                      } else {
                        next.delete(character.id);
                      }
                      updateScene(currentProject.id, currentScene.id, {
                        castCharacterIds: Array.from(next),
                      });
                    }}
                  />
                  <span>{character.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 三阶段生成 */}
        <Accordion
          type="single"
          collapsible
          className="space-y-4"
          value={activeAccordion}
          onValueChange={setActiveAccordion}
        >
          {/* 阶段1: 场景锚点 */}
          <AccordionItem value="scene" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentScene.sceneDescription ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                  }`}
                >
                  {currentScene.sceneDescription ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">1</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">场景锚点生成</h4>
                  <p className="text-xs text-muted-foreground">
                    只生成环境一致性锚点（空间/光线/固定物件），不含人物与动作
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="mb-4 rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="skip-scene-description">跳过场景锚点生成</Label>
                    <p className="text-xs text-muted-foreground">
                      启用后将直接使用手动输入的场景锚点，不再调用 AI。
                    </p>
                  </div>
                  <Switch
                    id="skip-scene-description"
                    checked={Boolean(currentSkipSteps.sceneDescription)}
                    onCheckedChange={(checked) => {
                      if (!currentProject || !currentScene) return;
                      setSceneSkipSteps(currentProject.id, currentScene.id, {
                        sceneDescription: checked,
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-scene-description">手动输入场景锚点</Label>
                  <Textarea
                    id="manual-scene-description"
                    value={currentManualOverrides.sceneDescription ?? ''}
                    onChange={(e) => {
                      if (!currentProject || !currentScene) return;
                      setSceneManualOverrides(currentProject.id, currentScene.id, {
                        sceneDescription: e.target.value,
                      });
                    }}
                    placeholder="直接填写场景锚点 JSON 或描述文本"
                    className="min-h-[120px] resize-y"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!currentSkipSteps.sceneDescription}
                      onClick={() =>
                        applyManualSceneDescription(currentManualOverrides.sceneDescription)
                      }
                    >
                      应用手动输入
                    </Button>
                  </div>
                </div>
              </div>
              {currentScene.sceneDescription ? (
                <div className="space-y-3">
                  {parsedSceneAnchor.isStructured && (
                    <div className="space-y-3">
                      {[
                        { label: 'SCENE_ANCHOR（场景锚点）', data: parsedSceneAnchor.sceneAnchor },
                        { label: 'LOCK（锚点锁定）', data: parsedSceneAnchor.lock },
                        { label: 'AVOID（避免项）', data: parsedSceneAnchor.avoid },
                      ].map(({ label, data }) => {
                        if (!data || (!data.zh && !data.en)) {
                          return null;
                        }

                        const preview = [
                          data.zh ? `ZH: ${data.zh}` : '',
                          data.en ? `EN: ${data.en}` : '',
                        ]
                          .filter(Boolean)
                          .join('\n\n');

                        return (
                          <div key={label} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-sm">{label}</div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPromptPreview(label, preview)}
                                  title="全屏查看"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!data.zh}
                                  onClick={() =>
                                    data.zh && copyToClipboard(data.zh, `已复制 ${label} 中文`)
                                  }
                                  title={`复制 ${label} 中文`}
                                >
                                  ZH
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!data.en}
                                  onClick={() =>
                                    data.en && copyToClipboard(data.en, `已复制 ${label} 英文`)
                                  }
                                  title={`复制 ${label} 英文`}
                                >
                                  EN
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              value={preview}
                              readOnly
                              className="min-h-[160px] resize-y font-mono text-sm leading-relaxed bg-background/60"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-8 w-8"
                      onClick={() => openPromptEditor('sceneDescription', '场景锚点（原文）')}
                      title="全屏编辑"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Textarea
                      value={currentScene.sceneDescription}
                      onChange={(e) =>
                        updateScene(currentProject.id, currentScene.id, {
                          sceneDescription: e.target.value,
                        })
                      }
                      className="min-h-[240px] resize-y leading-relaxed pr-12"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateSceneDescription}
                    disabled={isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isExternallyBlocked ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}
                    <span>{isExternallyBlocked ? '批量操作中' : '重新生成'}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">点击生成按钮开始创建场景锚点</p>
                  <Button
                    onClick={generateSceneDescription}
                    disabled={!canGenerateScene || isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isGenerating && generatingStep === 'scene_description' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : isExternallyBlocked ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>批量操作中</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>生成</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* 阶段2: 关键帧提示词（KF0/KF1/KF2） */}
          <AccordionItem value="keyframe" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentScene.shotPrompt ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                  }`}
                >
                  {currentScene.shotPrompt ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">2</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">关键帧提示词（KF0/KF1/KF2）</h4>
                  <p className="text-xs text-muted-foreground">
                    三张静止关键帧（起/中/终），用于生图模型
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="mb-4 rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="skip-shot-prompt">跳过关键帧生成</Label>
                    <p className="text-xs text-muted-foreground">
                      启用后将直接使用手动输入的关键帧提示词，不再调用 AI。
                    </p>
                  </div>
                  <Switch
                    id="skip-shot-prompt"
                    checked={Boolean(currentSkipSteps.shotPrompt)}
                    onCheckedChange={(checked) => {
                      if (!currentProject || !currentScene) return;
                      setSceneSkipSteps(currentProject.id, currentScene.id, {
                        shotPrompt: checked,
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-shot-prompt">手动输入关键帧提示词</Label>
                  <Textarea
                    id="manual-shot-prompt"
                    value={currentManualOverrides.shotPrompt ?? ''}
                    onChange={(e) => {
                      if (!currentProject || !currentScene) return;
                      setSceneManualOverrides(currentProject.id, currentScene.id, {
                        shotPrompt: e.target.value,
                      });
                    }}
                    placeholder="直接填写关键帧 JSON 或提示词文本"
                    className="min-h-[120px] resize-y"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!currentSkipSteps.shotPrompt}
                      onClick={() => applyManualShotPrompt(currentManualOverrides.shotPrompt)}
                    >
                      应用手动输入
                    </Button>
                  </div>
                </div>
              </div>
              {currentScene.shotPrompt ? (
                <div className="space-y-3">
                  {/* KF0/KF1/KF2 快速复制区块（识别到结构化标签时显示） */}
                  {parsedKeyframes.isStructured && (
                    <div className="space-y-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        {[
                          { label: 'KF0（起始）', data: parsedKeyframes.keyframes[0] },
                          { label: 'KF1（中间）', data: parsedKeyframes.keyframes[1] },
                          { label: 'KF2（结束）', data: parsedKeyframes.keyframes[2] },
                        ].map(({ label, data }) => {
                          const hasAny = Boolean(data.zh || data.en);
                          const preview = [
                            data.zh ? `ZH: ${data.zh}` : '',
                            data.en ? `EN: ${data.en}` : '',
                          ]
                            .filter(Boolean)
                            .join('\n\n');

                          return (
                            <div
                              key={label}
                              className="rounded-lg border bg-muted/30 p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium text-sm">{label}</div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPromptPreview(label, hasAny ? preview : '')}
                                    title="全屏查看"
                                    disabled={!hasAny}
                                  >
                                    <Maximize2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!data.zh}
                                    onClick={() =>
                                      data.zh && copyToClipboard(data.zh, `已复制 ${label} 中文`)
                                    }
                                    title={`复制 ${label} 中文`}
                                  >
                                    ZH
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!data.en}
                                    onClick={() =>
                                      data.en && copyToClipboard(data.en, `已复制 ${label} 英文`)
                                    }
                                    title={`复制 ${label} 英文`}
                                  >
                                    EN
                                  </Button>
                                </div>
                              </div>
                              <Textarea
                                value={
                                  hasAny
                                    ? preview
                                    : '（未解析到该关键帧，请检查 KF0/KF1/KF2 标签是否完整）'
                                }
                                readOnly
                                className="min-h-[220px] resize-y font-mono text-sm leading-relaxed bg-background/60"
                              />
                            </div>
                          );
                        })}
                      </div>

                      {parsedKeyframes.avoid && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-sm">AVOID（负面/避免项）</div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  openPromptPreview(
                                    'AVOID（负面/避免项）',
                                    [
                                      parsedKeyframes.avoid?.zh
                                        ? `ZH: ${parsedKeyframes.avoid.zh}`
                                        : '',
                                      parsedKeyframes.avoid?.en
                                        ? `EN: ${parsedKeyframes.avoid.en}`
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join('\n\n'),
                                  )
                                }
                                title="全屏查看"
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!parsedKeyframes.avoid.zh}
                                onClick={() =>
                                  parsedKeyframes.avoid?.zh &&
                                  copyToClipboard(parsedKeyframes.avoid.zh, '已复制 AVOID 中文')
                                }
                                title="复制 AVOID 中文"
                              >
                                ZH
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!parsedKeyframes.avoid.en}
                                onClick={() =>
                                  parsedKeyframes.avoid?.en &&
                                  copyToClipboard(parsedKeyframes.avoid.en, '已复制 AVOID 英文')
                                }
                                title="复制 AVOID 英文"
                              >
                                EN
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            value={[
                              parsedKeyframes.avoid.zh ? `ZH: ${parsedKeyframes.avoid.zh}` : '',
                              parsedKeyframes.avoid.en ? `EN: ${parsedKeyframes.avoid.en}` : '',
                            ]
                              .filter(Boolean)
                              .join('\n\n')}
                            readOnly
                            className="min-h-[140px] resize-y font-mono text-sm leading-relaxed bg-background/60"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-8 w-8"
                      onClick={() => openPromptEditor('shotPrompt', '关键帧提示词（KF0/KF1/KF2）')}
                      title="全屏编辑"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Textarea
                      value={currentScene.shotPrompt}
                      onChange={(e) =>
                        updateScene(currentProject.id, currentScene.id, {
                          shotPrompt: e.target.value,
                        })
                      }
                      className="min-h-[320px] resize-y font-mono text-sm leading-relaxed pr-12"
                      placeholder="三关键帧提示词（KF0/KF1/KF2）..."
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateKeyframePrompt}
                    disabled={isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isExternallyBlocked ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}
                    <span>{isExternallyBlocked ? '批量操作中' : '重新生成'}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {canGenerateKeyframe
                      ? '准备就绪，可以生成关键帧提示词（KF0/KF1/KF2）'
                      : '请先完成场景锚点'}
                  </p>
                  <Button
                    onClick={generateKeyframePrompt}
                    disabled={!canGenerateKeyframe || isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isGenerating && generatingStep === 'keyframe_prompt' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : isExternallyBlocked ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>批量操作中</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>生成</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* 阶段3: 时空/运动提示词 */}
          <AccordionItem value="motion" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentScene.motionPrompt ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                  }`}
                >
                  {currentScene.motionPrompt ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">3</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">时空/运动提示词</h4>
                  <p className="text-xs text-muted-foreground">
                    基于三关键帧差分生成“变化描述”，用于图生视频模型
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {currentScene.motionPrompt ? (
                <div className="space-y-3">
                  {parsedMotion.isStructured && (
                    <div className="space-y-3">
                      {[
                        { label: 'MOTION_SHORT（短版）', data: parsedMotion.motionShort },
                        { label: 'MOTION_BEATS（分拍）', data: parsedMotion.motionBeats },
                        { label: 'CONSTRAINTS（约束）', data: parsedMotion.constraints },
                      ].map(({ label, data }) => {
                        if (!data || (!data.zh && !data.en)) {
                          return null;
                        }

                        const preview = [
                          data.zh ? `ZH: ${data.zh}` : '',
                          data.en ? `EN: ${data.en}` : '',
                        ]
                          .filter(Boolean)
                          .join('\n\n');

                        return (
                          <div key={label} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-sm">{label}</div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPromptPreview(label, preview)}
                                  title="全屏查看"
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!data.zh}
                                  onClick={() =>
                                    data.zh && copyToClipboard(data.zh, `已复制 ${label} 中文`)
                                  }
                                  title={`复制 ${label} 中文`}
                                >
                                  ZH
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!data.en}
                                  onClick={() =>
                                    data.en && copyToClipboard(data.en, `已复制 ${label} 英文`)
                                  }
                                  title={`复制 ${label} 英文`}
                                >
                                  EN
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              value={preview}
                              readOnly
                              className="min-h-[160px] resize-y font-mono text-sm leading-relaxed bg-background/60"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-8 w-8"
                      onClick={() => openPromptEditor('motionPrompt', '时空/运动提示词')}
                      title="全屏编辑"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Textarea
                      value={currentScene.motionPrompt}
                      onChange={(e) =>
                        updateScene(currentProject.id, currentScene.id, {
                          motionPrompt: e.target.value,
                        })
                      }
                      className="min-h-[260px] resize-y font-mono text-sm leading-relaxed pr-12"
                      placeholder="时空/运动提示词..."
                    />
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    💡 建议包含：短版 + 分拍版(0-1s/1-2s/2-3s) +
                    强约束（保持人物/服装/场景锚点不漂）
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateMotionPrompt}
                    disabled={isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isExternallyBlocked ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4" />
                    )}
                    <span>{isExternallyBlocked ? '批量操作中' : '重新生成'}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {canGenerateMotion
                      ? '准备就绪，可以生成时空/运动提示词'
                      : '请先完成关键帧提示词（KF0/KF1/KF2）'}
                  </p>
                  <Button
                    onClick={generateMotionPrompt}
                    disabled={!canGenerateMotion || isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isGenerating && generatingStep === 'motion_prompt' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : isExternallyBlocked ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>批量操作中</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>生成</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* 阶段4: 台词生成 */}
          <AccordionItem value="dialogue" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    hasDialogues ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                  }`}
                >
                  {hasDialogues ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">4</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">台词生成</h4>
                  <p className="text-xs text-muted-foreground">
                    生成对白、独白、旁白、心理活动，用于配音/字幕
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {hasDialogues ? (
                <div className="space-y-3">
                  {/* 台词列表 */}
                  <div className="space-y-2">
                    {currentScene.dialogues?.map((dialogue) => (
                      <div
                        key={dialogue.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 group"
                      >
                        <div className="flex flex-col gap-1">
                          <div
                            className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                              dialogue.type === 'dialogue'
                                ? 'bg-blue-500/10 text-blue-600'
                                : dialogue.type === 'monologue'
                                  ? 'bg-purple-500/10 text-purple-600'
                                  : dialogue.type === 'narration'
                                    ? 'bg-gray-500/10 text-gray-600'
                                    : 'bg-pink-500/10 text-pink-600'
                            }`}
                          >
                            {DIALOGUE_TYPE_LABELS[dialogue.type]}
                          </div>
                          {/* 情绪标注 */}
                          {dialogue.emotion && (
                            <div className="px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-600">
                              {dialogue.emotion}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {dialogue.characterName && (
                            <span className="font-medium text-sm">{dialogue.characterName}: </span>
                          )}
                          <span className="text-sm">{dialogue.content}</span>
                          {/* 备注 */}
                          {dialogue.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              🎬 {dialogue.notes}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                          onClick={() => {
                            const text = dialogue.characterName
                              ? `${dialogue.characterName}: ${dialogue.content}`
                              : dialogue.content;
                            navigator.clipboard.writeText(text);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* 复制全部台词 */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allDialogues =
                          currentScene.dialogues
                            ?.map((d) => {
                              const typeLabel = DIALOGUE_TYPE_LABELS[d.type];
                              return d.characterName
                                ? `[${typeLabel}] ${d.characterName}: ${d.content}`
                                : `[${typeLabel}] ${d.content}`;
                            })
                            .join('\n') || '';
                        navigator.clipboard.writeText(allDialogues);
                      }}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      <span>复制全部</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generateDialogue}
                      disabled={isGenerating || isExternallyBlocked}
                      className="gap-2"
                      title={isExternallyBlocked ? externalBlockMessage : ''}
                    >
                      {isExternallyBlocked ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                      <span>{isExternallyBlocked ? '批量操作中' : '重新生成'}</span>
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    💡 台词可用于视频配音、字幕生成或剧本导出
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {canGenerateDialogue ? '准备就绪，可以生成台词' : '请先完成时空/运动提示词'}
                  </p>
                  <Button
                    onClick={generateDialogue}
                    disabled={!canGenerateDialogue || isGenerating || isExternallyBlocked}
                    className="gap-2"
                    title={isExternallyBlocked ? externalBlockMessage : ''}
                  >
                    {isGenerating && generatingStep === 'dialogue' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : isExternallyBlocked ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>批量操作中</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4" />
                        <span>生成</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* 多模态提示词预览 - 仅在有台词时显示 */}
        {hasDialogues && (
          <div className="mt-6 p-4 rounded-lg border bg-gradient-to-r from-purple-500/5 to-blue-500/5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>多模态提示词预览</span>
              <span className="text-xs font-normal text-muted-foreground">
                (基于当前分镜自动生成)
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* BGM提示词 */}
              {(() => {
                const bgmPrompt = generateBGMPrompt(currentScene);
                return (
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🎵</span>
                      <span className="font-medium text-sm">BGM/音效</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p>
                        <span className="text-muted-foreground">氛围:</span> {bgmPrompt.mood}
                      </p>
                      <p>
                        <span className="text-muted-foreground">风格:</span> {bgmPrompt.genre}
                      </p>
                      <p>
                        <span className="text-muted-foreground">节奏:</span> {bgmPrompt.tempo}
                      </p>
                      <p>
                        <span className="text-muted-foreground">乐器:</span>{' '}
                        {bgmPrompt.instruments.join(', ') || '无'}
                      </p>
                      {bgmPrompt.soundEffects.length > 0 && (
                        <p>
                          <span className="text-muted-foreground">音效:</span>{' '}
                          {bgmPrompt.soundEffects.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 转场提示词 */}
              {(() => {
                const nextScene = scenes[currentSceneIndex + 1];
                if (!nextScene)
                  return (
                    <div className="p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🎬</span>
                        <span className="font-medium text-sm">转场指令</span>
                      </div>
                      <p className="text-xs text-muted-foreground">这是最后一个分镜，无需转场</p>
                    </div>
                  );

                const transitionPrompt = generateTransitionPrompt(currentScene, nextScene);
                return (
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🎬</span>
                      <span className="font-medium text-sm">转场指令</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p>
                        <span className="text-muted-foreground">类型:</span> {transitionPrompt.type}
                      </p>
                      <p>
                        <span className="text-muted-foreground">时长:</span>{' '}
                        {transitionPrompt.duration}s
                      </p>
                      <p>
                        <span className="text-muted-foreground">缓动:</span>{' '}
                        {transitionPrompt.easing}
                      </p>
                      {transitionPrompt.direction && (
                        <p>
                          <span className="text-muted-foreground">方向:</span>{' '}
                          {transitionPrompt.direction}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              💡 多模态提示词可用于视频配乐、转场效果和配音合成
            </p>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => generateAll(false)}
              disabled={isGenerating || isBatchGenerating || isCompleted || isExternallyBlocked}
              className="gap-2"
              title={isExternallyBlocked ? externalBlockMessage : ''}
            >
              {isBatchGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>批量生成中...</span>
                </>
              ) : isExternallyBlocked ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>批量操作中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>一键生成全部</span>
                </>
              )}
            </Button>
            {isCompleted && (
              <Button
                variant="ghost"
                onClick={async () => {
                  const ok = await confirm({
                    title: '确认重新生成当前分镜？',
                    description: '这将覆盖当前分镜的所有已生成内容，且无法撤销。',
                    confirmText: '重新生成',
                    cancelText: '取消',
                    destructive: true,
                  });
                  if (!ok) return;
                  generateAll(true);
                }}
                disabled={isGenerating || isBatchGenerating || isExternallyBlocked}
                className="gap-2"
                title={isExternallyBlocked ? externalBlockMessage : '重新生成当前分镜的所有内容'}
              >
                <RotateCw className="h-4 w-4" />
                <span>重新生成全部</span>
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {isAllScenesComplete ? (
              <Button
                onClick={() => {
                  updateProject(currentProject.id, {
                    workflowState: 'ALL_SCENES_COMPLETE',
                  });
                  window.dispatchEvent(new CustomEvent('workflow:next-step'));
                }}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                <span>前往导出</span>
              </Button>
            ) : (
              <Button
                onClick={goToNextScene}
                disabled={currentSceneIndex === scenes.length - 1 || !isCompleted}
                className="gap-2"
              >
                <span>下一个分镜</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 提示卡片 */}
      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <span>细化建议</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            • <strong>渐进式生成</strong>: 按顺序完成四个阶段，每步都可手动编辑优化
          </li>
          <li>
            • <strong>关键帧提示词（KF0/KF1/KF2）</strong>: 三张静止画面描述，可分别用于生图模型
          </li>
          <li>
            • <strong>时空/运动提示词</strong>: 基于三关键帧的变化描述，用于图生视频模型
          </li>
          <li>
            • <strong>台词生成</strong>: 对白/独白/旁白/心理活动，可用于配音或字幕
          </li>
          <li>
            • <strong>批量处理</strong>: 完成所有分镜后可在导出页面统一查看和管理
          </li>
        </ul>
      </Card>

      {/* 分镜列表对话框 */}
      <Dialog open={sceneListDialogOpen} onOpenChange={setSceneListDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>分镜列表（快速跳转）</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={sceneListQuery}
              onChange={(e) => setSceneListQuery(e.target.value)}
              placeholder="搜索分镜概要..."
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={sceneListFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setSceneListFilter('all')}
              >
                全部
              </Button>
              <Button
                size="sm"
                variant={sceneListFilter === 'incomplete' ? 'default' : 'outline'}
                onClick={() => setSceneListFilter('incomplete')}
              >
                未完成
              </Button>
              <Button
                size="sm"
                variant={sceneListFilter === 'completed' ? 'default' : 'outline'}
                onClick={() => setSceneListFilter('completed')}
              >
                已完成
              </Button>
              <Button
                size="sm"
                variant={sceneListFilter === 'needs_update' ? 'default' : 'outline'}
                onClick={() => setSceneListFilter('needs_update')}
              >
                需更新
              </Button>
            </div>

            <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
              {filteredSceneList.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  没有匹配的分镜
                </div>
              ) : (
                filteredSceneList.map(({ scene, index, isFullyCompleted, isNeedsUpdate }) => (
                  <button
                    key={scene.id}
                    type="button"
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      index === currentSceneIndex ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      goToScene(index);
                      setSceneListDialogOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{scene.summary}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {isNeedsUpdate ? (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              需更新
                            </Badge>
                          ) : isFullyCompleted ? (
                            <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">
                              已完成
                            </Badge>
                          ) : (
                            <Badge variant="secondary">未完成</Badge>
                          )}
                          {scene.sceneDescription && (
                            <span className="text-xs text-muted-foreground">锚点✓</span>
                          )}
                          {scene.shotPrompt && (
                            <span className="text-xs text-muted-foreground">关键帧✓</span>
                          )}
                          {scene.motionPrompt && (
                            <span className="text-xs text-muted-foreground">运动✓</span>
                          )}
                          {scene.dialogues?.length ? (
                            <span className="text-xs text-muted-foreground">台词✓</span>
                          ) : null}
                        </div>
                      </div>
                      {index === currentSceneIndex && (
                        <Badge variant="outline" className="flex-shrink-0">
                          当前
                        </Badge>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 模板库对话框 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>提示词模板库</DialogTitle>
          </DialogHeader>
          <TemplateGallery onApplyTemplate={handleApplyTemplate} />
        </DialogContent>
      </Dialog>

      {/* 复制角色信息对话框 */}
      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择要复制的角色</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-auto">
            {projectCharacters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                还没有创建角色，请先在基础设定中添加角色
              </p>
            ) : (
              projectCharacters.map((character) => (
                <div
                  key={character.id}
                  className="p-4 rounded-lg border hover:border-primary cursor-pointer transition-colors"
                  onClick={() => handleCharacterSelect(character)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: character.themeColor || '#6366f1' }}
                    >
                      {character.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{character.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {character.appearance || '暂无外观描述'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
