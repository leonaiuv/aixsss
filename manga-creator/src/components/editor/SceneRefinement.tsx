import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Trash2
} from 'lucide-react';
import { AIFactory } from '@/lib/ai/factory';
import { getSkillByName, parseDialoguesFromText } from '@/lib/ai/skills';
import { logAICall, updateLogWithResponse, updateLogWithError, updateLogProgress } from '@/lib/ai/debugLogger';
import { fillPromptTemplate, buildCharacterContext } from '@/lib/ai/contextBuilder';
import { shouldInjectAtSceneDescription, getInjectionSettings } from '@/lib/ai/worldViewInjection';
import { generateBGMPrompt, generateTransitionPrompt, BGMPrompt, TransitionPrompt } from '@/lib/ai/multiModalPrompts';
import { checkTokenLimit, calculateTotalTokens, compressProjectEssence } from '@/lib/ai/contextCompressor';
import { SceneStep, migrateOldStyleToConfig, Project, DIALOGUE_TYPE_LABELS, DialogueLine } from '@/types';
import { TemplateGallery } from './TemplateGallery';

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

export function SceneRefinement() {
  const { currentProject, updateProject } = useProjectStore();
  const { scenes, updateScene, loadScenes } = useStoryboardStore();
  const { config } = useConfigStore();
  const { characters } = useCharacterStore();
  const { elements: worldViewElements, loadElements: loadWorldViewElements } = useWorldViewStore();
  const { 
    isBatchGenerating: isGlobalBatchGenerating, 
    batchGeneratingSource,
    startBatchGenerating,
    stopBatchGenerating 
  } = useAIProgressStore();

  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<SceneStep | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [error, setError] = useState('');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);

// 使用 useMemo 优化项目角色列表过滤
  const projectCharacters = useMemo(() => 
    characters.filter(c => c.projectId === currentProject?.id),
    [characters, currentProject?.id]
  );

  // 缓存进度计算 - 必须在条件返回之前调用 hooks
  const progress = useMemo(() => {
    if (scenes.length === 0) return 0;
    return Math.round(((currentSceneIndex + 1) / scenes.length) * 100);
  }, [currentSceneIndex, scenes.length]);

  // 使用 useCallback 优化导航回调 - 必须在条件返回之前
  const goToPrevScene = useCallback(() => {
    if (currentSceneIndex > 0 && currentProject) {
      setCurrentSceneIndex(currentSceneIndex - 1);
      updateProject(currentProject.id, {
        currentSceneOrder: currentSceneIndex,
      });
    }
  }, [currentSceneIndex, currentProject?.id, updateProject]);

  const goToNextScene = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1 && currentProject) {
      setCurrentSceneIndex(currentSceneIndex + 1);
      updateProject(currentProject.id, {
        currentSceneOrder: currentSceneIndex + 2,
      });
    }
  }, [currentSceneIndex, scenes.length, currentProject?.id, updateProject]);

  useEffect(() => {
    if (currentProject) {
      loadScenes(currentProject.id);
      loadWorldViewElements(currentProject.id);
      const order = currentProject.currentSceneOrder || 1;
      setCurrentSceneIndex(order - 1);
    }
  }, [currentProject?.id]);

  if (!currentProject || scenes.length === 0) {
    return null;
  }

  const currentScene = scenes[currentSceneIndex];

  // 生成场景描述
  const generateSceneDescription = async () => {
    if (!config || !currentScene) return;

    setIsGenerating(true);
    setGeneratingStep('scene_description');
    setError('');

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
      console.log(`[上下文压缩] Token估算: ${tokenEstimate}, 使用率: ${tokenCheck.usage.toFixed(1)}%`);
      
      // 如果接近限制，使用压缩策略
      if (tokenCheck.usage > 70) {
        const compressed = compressProjectEssence(currentProject, 'balanced');
        console.log(`[上下文压缩] 已压缩项目信息: ${compressed.tokens} tokens`);
      }

      // 记录AI调用日志
      const prevSceneSummary = currentSceneIndex > 0 ? scenes[currentSceneIndex - 1].summary : undefined;
      const logId = logAICall('scene_description', {
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
        },
      });
      
      updateLogProgress(logId, 30, '正在生成场景描述...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
      updateLogProgress(logId, 80, '正在保存结果...');

      // 更新日志响应
      updateLogWithResponse(logId, {
        content: response.content,
        tokenUsage: response.tokenUsage,
      });

      updateScene(currentProject.id, currentScene.id, {
        sceneDescription: response.content.trim(),
        status: 'scene_confirmed',
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成场景描述失败:', err);
      updateLogWithError('scene_description_error', errorMsg);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成关键帧提示词
  const generateKeyframePrompt = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find(s => s.id === currentScene?.id);
    
    if (!config || !latestScene || !latestScene.sceneDescription) return;

    setIsGenerating(true);
    setGeneratingStep('keyframe_prompt');
    setError('');

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
        characters: projectCharacters,
        protagonist: currentProject.protagonist,
        sceneDescription: latestScene.sceneDescription,
      });

      // 记录AI调用日志
      const logId = logAICall('keyframe_prompt', {
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
        },
      });
      
      updateLogProgress(logId, 30, '正在生成关键帧提示词...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
      updateLogProgress(logId, 80, '正在保存关键帧...');

      // 更新日志响应
      updateLogWithResponse(logId, {
        content: response.content,
        tokenUsage: response.tokenUsage,
      });

      updateScene(currentProject.id, latestScene.id, {
        shotPrompt: response.content.trim(),
        status: 'keyframe_confirmed',
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成关键帧提示词失败:', err);
      updateLogWithError('keyframe_prompt_error', errorMsg);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成时空提示词
  const generateMotionPrompt = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find(s => s.id === currentScene?.id);
    
    if (!config || !latestScene || !latestScene.shotPrompt) return;

    setIsGenerating(true);
    setGeneratingStep('motion_prompt');
    setError('');

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
      const logId = logAICall('motion_prompt', {
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
        },
      });
      
      updateLogProgress(logId, 30, '正在生成时空提示词...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
      updateLogProgress(logId, 80, '正在保存结果...');

      // 更新日志响应
      updateLogWithResponse(logId, {
        content: response.content,
        tokenUsage: response.tokenUsage,
      });

      updateScene(currentProject.id, latestScene.id, {
        motionPrompt: response.content.trim(),
        status: 'motion_generating',
      });

      // 如果是最后一个分镜,更新项目状态
      if (currentSceneIndex === scenes.length - 1) {
        updateProject(currentProject.id, {
          workflowState: 'ALL_SCENES_COMPLETE',
          updatedAt: new Date().toISOString(),
        });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成时空提示词失败:', err);
      updateLogWithError('motion_prompt_error', errorMsg);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成台词
  const generateDialogue = async () => {
    // 从 store 获取最新的场景数据，避免闭包问题
    const { scenes: latestScenes } = useStoryboardStore.getState();
    const latestScene = latestScenes.find(s => s.id === currentScene?.id);
    
    if (!config || !latestScene || !latestScene.motionPrompt) return;

    setIsGenerating(true);
    setGeneratingStep('dialogue');
    setError('');

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_dialogue');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      // 使用 contextBuilder 构建角色上下文
      const characterContext = buildCharacterContext(projectCharacters);

      // 使用 fillPromptTemplate 填充模板
      const prompt = fillPromptTemplate(skill.promptTemplate, {
        characters: projectCharacters,
        sceneSummary: latestScene.summary,
        sceneDescription: latestScene.sceneDescription,
        shotPrompt: latestScene.shotPrompt,
        motionPrompt: latestScene.motionPrompt,
      });

      // 记录AI调用日志
      const logId = logAICall('dialogue', {
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
        },
      });
      
      updateLogProgress(logId, 30, '正在生成台词...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
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

      // 如果是最后一个分镜,更新项目状态
      if (currentSceneIndex === scenes.length - 1) {
        updateProject(currentProject.id, {
          workflowState: 'ALL_SCENES_COMPLETE',
          updatedAt: new Date().toISOString(),
        });
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '生成失败';
      setError(errorMsg);
      console.error('生成台词失败:', err);
      updateLogWithError('dialogue_error', errorMsg);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 一键生成全部 - 优化版本
  const generateAll = async (forceRegenerate = false) => {
    // 防止重复触发或被外部批量操作阻止
    if (isBatchGenerating || isGenerating || isExternallyBlocked) {
      return;
    }

    setIsBatchGenerating(true);
    startBatchGenerating('scene_refinement');
    setError('');

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
        // 等待状态更新
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 第一阶段：生成场景描述
      const { scenes: currentScenes } = useStoryboardStore.getState();
      const scene0 = currentScenes.find(s => s.id === currentScene.id);
      if (!scene0?.sceneDescription) {
        setGeneratingStep('scene_description');
        await generateSceneDescription();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 获取最新场景数据
      const { scenes: updatedScenes1 } = useStoryboardStore.getState();
      const latestScene1 = updatedScenes1.find(s => s.id === currentScene.id);
      
      if (!latestScene1?.sceneDescription) {
        throw new Error('场景描述生成失败');
      }

      // 第二阶段：生成关键帧提示词
      if (!latestScene1.shotPrompt) {
        setGeneratingStep('keyframe_prompt');
        await generateKeyframePrompt();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 获取最新场景数据
      const { scenes: updatedScenes2 } = useStoryboardStore.getState();
      const latestScene2 = updatedScenes2.find(s => s.id === currentScene.id);
      
      if (!latestScene2?.shotPrompt) {
        throw new Error('关键帧提示词生成失败');
      }

      // 第三阶段：生成时空提示词
      if (!latestScene2.motionPrompt) {
        setGeneratingStep('motion_prompt');
        await generateMotionPrompt();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 获取最新场景数据
      const { scenes: updatedScenes3 } = useStoryboardStore.getState();
      const latestScene3 = updatedScenes3.find(s => s.id === currentScene.id);
      
      if (!latestScene3?.motionPrompt) {
        throw new Error('时空提示词生成失败');
      }

      // 第四阶段：生成台词
      if (!latestScene3.dialogues || latestScene3.dialogues.length === 0) {
        setGeneratingStep('dialogue');
        await generateDialogue();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '一键生成失败';
      setError(errorMessage);
      console.error('一键生成全部失败:', err);
    } finally {
      setIsBatchGenerating(false);
      stopBatchGenerating();
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  const canGenerateScene = !currentScene.sceneDescription;
  const canGenerateKeyframe = currentScene.sceneDescription && !currentScene.shotPrompt;
  const canGenerateMotion = currentScene.shotPrompt && !currentScene.motionPrompt;
  const canGenerateDialogue = currentScene.motionPrompt && (!currentScene.dialogues || currentScene.dialogues.length === 0);
  const hasDialogues = currentScene.dialogues && currentScene.dialogues.length > 0;
  const isCompleted = currentScene.status === 'completed' && hasDialogues;
  
  // 检查是否被外部批量操作禁用（如批量操作面板正在生成）
  const isExternallyBlocked = isGlobalBatchGenerating && batchGeneratingSource === 'batch_panel';
  const externalBlockMessage = isExternallyBlocked ? '批量操作正在进行中，请等待完成' : '';

  // 应用模板
  const handleApplyTemplate = (template: string, variables: Record<string, string>) => {
    let content = template;
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    
    // 应用到当前分镜的场景描述
    if (currentScene) {
      updateScene(currentProject!.id, currentScene.id, {
        sceneDescription: content,
        status: 'scene_confirmed',
      });
    }
    setTemplateDialogOpen(false);
  };

  // 引用角色
  const handleCharacterSelect = (character: typeof projectCharacters[0]) => {
    if (currentScene) {
      const characterInfo = `角色: ${character.name}
外观: ${character.appearance}
性格: ${character.personality}`;
      
      const newDescription = currentScene.sceneDescription 
        ? `${currentScene.sceneDescription}\n\n${characterInfo}`
        : characterInfo;
      
      updateScene(currentProject!.id, currentScene.id, {
        sceneDescription: newDescription,
      });
    }
    setCharacterDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
      {/* 头部导航 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">分镜细化</h2>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <span>{currentSceneIndex + 1} / {scenes.length}</span>
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
            {/* 角色引用按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCharacterDialogOpen(true)}
              disabled={projectCharacters.length === 0}
              className="gap-2"
              title={projectCharacters.length === 0 ? '请先在基础设定中添加角色' : '引用已创建的角色信息'}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">引用角色</span>
              {projectCharacters.length === 0 && (
                <span className="text-xs text-muted-foreground">(无角色)</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevScene}
              disabled={currentSceneIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextScene}
              disabled={currentSceneIndex === scenes.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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

        {/* 三阶段生成 */}
        <Accordion type="single" collapsible className="space-y-4">
          {/* 阶段1: 场景描述 */}
          <AccordionItem value="scene" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentScene.sceneDescription ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
                  {currentScene.sceneDescription ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">1</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">场景描述生成</h4>
                  <p className="text-xs text-muted-foreground">
                    基于分镜概要,生成详细的场景描述(环境、氛围、光影)
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {currentScene.sceneDescription ? (
                <div className="space-y-3">
                  <Textarea
                    value={currentScene.sceneDescription}
                    onChange={(e) => updateScene(currentProject.id, currentScene.id, {
                      sceneDescription: e.target.value
                    })}
                    className="min-h-[120px] resize-none"
                  />
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
                  <p className="text-sm text-muted-foreground">点击生成按钮开始创建场景描述</p>
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

          {/* 阶段2: 关键帧提示词 */}
          <AccordionItem value="keyframe" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentScene.shotPrompt ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
                  {currentScene.shotPrompt ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">2</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">关键帧提示词</h4>
                  <p className="text-xs text-muted-foreground">
                    生成静态图片描述，用于绘图AI生成关键帧
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {currentScene.shotPrompt ? (
                <div className="space-y-3">
                  <Textarea
                    value={currentScene.shotPrompt}
                    onChange={(e) => updateScene(currentProject.id, currentScene.id, {
                      shotPrompt: e.target.value
                    })}
                    className="min-h-[150px] resize-none font-mono text-sm"
                    placeholder="静态关键帧描述..."
                  />
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
                    {canGenerateKeyframe ? '准备就绪，可以生成关键帧提示词' : '请先完成场景描述'}
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

          {/* 阶段3: 时空提示词 */}
          <AccordionItem value="motion" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentScene.motionPrompt ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
                  {currentScene.motionPrompt ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">3</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">时空提示词</h4>
                  <p className="text-xs text-muted-foreground">
                    生成动作/镜头/变化描述，用于视频AI
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {currentScene.motionPrompt ? (
                <div className="space-y-3">
                  <Textarea
                    value={currentScene.motionPrompt}
                    onChange={(e) => updateScene(currentProject.id, currentScene.id, {
                      motionPrompt: e.target.value
                    })}
                    className="min-h-[100px] resize-none font-mono text-sm"
                    placeholder="时空提示词..."
                  />
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    💡 时空提示词应保持简短(15-25词)，包含动作、镜头运动、场面变化
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
                    {canGenerateMotion ? '准备就绪，可以生成时空提示词' : '请先完成关键帧提示词'}
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  hasDialogues ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
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
                    {currentScene.dialogues?.map((dialogue, index) => (
                      <div
                        key={dialogue.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 group"
                      >
                        <div className="flex flex-col gap-1">
                          <div className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                            dialogue.type === 'dialogue' ? 'bg-blue-500/10 text-blue-600' :
                            dialogue.type === 'monologue' ? 'bg-purple-500/10 text-purple-600' :
                            dialogue.type === 'narration' ? 'bg-gray-500/10 text-gray-600' :
                            'bg-pink-500/10 text-pink-600'
                          }`}>
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
                        const allDialogues = currentScene.dialogues?.map(d => {
                          const typeLabel = DIALOGUE_TYPE_LABELS[d.type];
                          return d.characterName 
                            ? `[${typeLabel}] ${d.characterName}: ${d.content}`
                            : `[${typeLabel}] ${d.content}`;
                        }).join('\n') || '';
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
                    {canGenerateDialogue ? '准备就绪，可以生成台词' : '请先完成时空提示词'}
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
              <span className="text-xs font-normal text-muted-foreground">(基于当前分镜自动生成)</span>
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
                      <p><span className="text-muted-foreground">氛围:</span> {bgmPrompt.mood}</p>
                      <p><span className="text-muted-foreground">风格:</span> {bgmPrompt.genre}</p>
                      <p><span className="text-muted-foreground">节奏:</span> {bgmPrompt.tempo}</p>
                      <p><span className="text-muted-foreground">乐器:</span> {bgmPrompt.instruments.join(', ') || '无'}</p>
                      {bgmPrompt.soundEffects.length > 0 && (
                        <p><span className="text-muted-foreground">音效:</span> {bgmPrompt.soundEffects.join(', ')}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* 转场提示词 */}
              {(() => {
                const nextScene = scenes[currentSceneIndex + 1];
                if (!nextScene) return (
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
                      <p><span className="text-muted-foreground">类型:</span> {transitionPrompt.type}</p>
                      <p><span className="text-muted-foreground">时长:</span> {transitionPrompt.duration}s</p>
                      <p><span className="text-muted-foreground">缓动:</span> {transitionPrompt.easing}</p>
                      {transitionPrompt.direction && (
                        <p><span className="text-muted-foreground">方向:</span> {transitionPrompt.direction}</p>
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
                onClick={() => {
                  if (confirm('确定要重新生成当前分镜的所有内容吗？这将覆盖现有内容。')) {
                    generateAll(true);
                  }
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
            {currentSceneIndex === scenes.length - 1 && isCompleted ? (
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
          <li>• <strong>渐进式生成</strong>: 按顺序完成四个阶段，每步都可手动编辑优化</li>
          <li>• <strong>关键帧提示词</strong>: 专注静态画面描述，适用于SD/MJ等绘图工具</li>
          <li>• <strong>时空提示词</strong>: 简短的动态描述，用于视频生成AI</li>
          <li>• <strong>台词生成</strong>: 对白/独白/旁白/心理活动，可用于配音或字幕</li>
          <li>• <strong>批量处理</strong>: 完成所有分镜后可在导出页面统一查看和管理</li>
        </ul>
      </Card>

      {/* 模板库对话框 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>提示词模板库</DialogTitle>
          </DialogHeader>
          <TemplateGallery onApplyTemplate={handleApplyTemplate} />
        </DialogContent>
      </Dialog>

      {/* 角色引用对话框 */}
      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择角色</DialogTitle>
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
