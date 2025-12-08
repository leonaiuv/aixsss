import { useState, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Check,
  Loader2,
  RotateCw,
  Eye,
  FileText
} from 'lucide-react';
import { AIFactory } from '@/lib/ai/factory';
import { getSkillByName } from '@/lib/ai/skills';
import { SceneStep } from '@/types';

export function SceneRefinement() {
  const { currentProject, updateProject } = useProjectStore();
  const { scenes, updateScene, loadScenes } = useStoryboardStore();
  const { config } = useConfigStore();

  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<SceneStep | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentProject) {
      loadScenes(currentProject.id);
      const order = currentProject.currentSceneOrder || 1;
      setCurrentSceneIndex(order - 1);
    }
  }, [currentProject?.id]);

  if (!currentProject || scenes.length === 0) {
    return null;
  }

  const currentScene = scenes[currentSceneIndex];
  const progress = Math.round(((currentSceneIndex + 1) / scenes.length) * 100);

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

      // 构建上下文
      const context = {
        projectEssence: {
          style: currentProject.style,
          protagonistCore: currentProject.protagonist,
          storyCore: currentProject.summary,
        },
        currentScene: currentScene,
        prevSceneSummary: currentSceneIndex > 0 ? scenes[currentSceneIndex - 1].summary : undefined,
      };

      // 替换模板变量
      const prompt = skill.promptTemplate
        .replace('{style}', context.projectEssence.style)
        .replace('{protagonist}', context.projectEssence.protagonistCore)
        .replace('{current_scene_summary}', currentScene.summary)
        .replace('{prev_scene_summary}', context.prevSceneSummary || '【本场景是第一个分镜】');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      updateScene(currentProject.id, currentScene.id, {
        sceneDescription: response.content.trim(),
        status: 'scene_confirmed',
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      console.error('生成场景描述失败:', err);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成动作描述
  const generateActionDescription = async () => {
    if (!config || !currentScene || !currentScene.sceneDescription) return;

    setIsGenerating(true);
    setGeneratingStep('action_description');
    setError('');

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_action_desc');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      const context = {
        projectEssence: {
          style: currentProject.style,
          protagonistCore: currentProject.protagonist,
          storyCore: currentProject.summary,
        },
        currentScene: currentScene,
        confirmedContent: currentScene.sceneDescription,
      };

      const prompt = skill.promptTemplate
        .replace('{protagonist}', context.projectEssence.protagonistCore)
        .replace('{scene_description}', currentScene.sceneDescription)
        .replace('{current_scene_summary}', currentScene.summary);

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      updateScene(currentProject.id, currentScene.id, {
        actionDescription: response.content.trim(),
        status: 'action_confirmed',
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      console.error('生成动作描述失败:', err);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 生成镜头提示词
  const generateShotPrompt = async () => {
    if (!config || !currentScene || !currentScene.actionDescription) return;

    setIsGenerating(true);
    setGeneratingStep('shot_prompt');
    setError('');

    try {
      const client = AIFactory.createClient(config);
      const skill = getSkillByName('generate_shot_prompt');

      if (!skill) {
        throw new Error('技能配置未找到');
      }

      const context = {
        projectEssence: {
          style: currentProject.style,
          protagonistCore: currentProject.protagonist,
          storyCore: currentProject.summary,
        },
        currentScene: currentScene,
        confirmedContent: `场景:${currentScene.sceneDescription}\n动作:${currentScene.actionDescription}`,
      };

      const prompt = skill.promptTemplate
        .replace('{style}', context.projectEssence.style)
        .replace('{protagonist}', context.projectEssence.protagonistCore)
        .replace('{scene_description}', currentScene.sceneDescription)
        .replace('{action_description}', currentScene.actionDescription);

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      updateScene(currentProject.id, currentScene.id, {
        shotPrompt: response.content.trim(),
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
      setError(err instanceof Error ? err.message : '生成失败');
      console.error('生成镜头提示词失败:', err);
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  // 导航到上/下一个分镜
  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
      updateProject(currentProject.id, {
        currentSceneOrder: currentSceneIndex,
      });
    }
  };

  const goToNextScene = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
      updateProject(currentProject.id, {
        currentSceneOrder: currentSceneIndex + 2,
      });
    }
  };

  // 一键生成全部 - 修复版本
  const generateAll = async () => {
    // 防止重复触发
    if (isBatchGenerating || isGenerating) {
      return;
    }

    setIsBatchGenerating(true);
    setError('');

    try {
      // 第一阶段：生成场景描述
      if (!currentScene.sceneDescription) {
        setGeneratingStep('scene_description');
        await generateSceneDescription();
        
        // 添加延迟确保状态更新
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 重新获取最新的场景数据
      let { scenes: updatedScenes1 } = useStoryboardStore.getState();
      let latestScene1 = updatedScenes1.find(s => s.id === currentScene.id);
      
      if (!latestScene1?.sceneDescription) {
        throw new Error('场景描述生成失败');
      }

      // 第二阶段：生成动作描述
      if (!latestScene1.actionDescription) {
        setGeneratingStep('action_description');
        await generateActionDescription();
        
        // 添加延迟确保状态更新
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 再次获取最新的场景数据
      let { scenes: updatedScenes2 } = useStoryboardStore.getState();
      let latestScene2 = updatedScenes2.find(s => s.id === currentScene.id);
      
      if (!latestScene2?.actionDescription) {
        throw new Error('动作描述生成失败');
      }

      // 第三阶段：生成镜头提示词
      if (!latestScene2.shotPrompt) {
        setGeneratingStep('shot_prompt');
        await generateShotPrompt();
        
        // 添加延迟确保状态更新
        await new Promise(resolve => setTimeout(resolve, 50));
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '一键生成失败';
      setError(errorMessage);
      console.error('一键生成全部失败:', err);
    } finally {
      setIsBatchGenerating(false);
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  const canGenerateScene = !currentScene.sceneDescription;
  const canGenerateAction = currentScene.sceneDescription && !currentScene.actionDescription;
  const canGeneratePrompt = currentScene.actionDescription && !currentScene.shotPrompt;
  const isCompleted = currentScene.status === 'completed';

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
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span>重新生成</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">点击生成按钮开始创建场景描述</p>
                  <Button
                    onClick={generateSceneDescription}
                    disabled={!canGenerateScene || isGenerating}
                    className="gap-2"
                  >
                    {isGenerating && generatingStep === 'scene_description' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
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

          {/* 阶段2: 动作描述 */}
          <AccordionItem value="action" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentScene.actionDescription ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
                  {currentScene.actionDescription ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">2</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">动作描述生成</h4>
                  <p className="text-xs text-muted-foreground">
                    基于场景描述,生成主角的动作、表情、肢体语言
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              {currentScene.actionDescription ? (
                <div className="space-y-3">
                  <Textarea
                    value={currentScene.actionDescription}
                    onChange={(e) => updateScene(currentProject.id, currentScene.id, {
                      actionDescription: e.target.value
                    })}
                    className="min-h-[120px] resize-none"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateActionDescription}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span>重新生成</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {canGenerateAction ? '准备就绪,可以生成动作描述' : '请先完成场景描述'}
                  </p>
                  <Button
                    onClick={generateActionDescription}
                    disabled={!canGenerateAction || isGenerating}
                    className="gap-2"
                  >
                    {isGenerating && generatingStep === 'action_description' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
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

          {/* 阶段3: 镜头提示词 */}
          <AccordionItem value="prompt" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentScene.shotPrompt ? 'bg-green-500/10 text-green-600' : 'bg-muted'
                }`}>
                  {currentScene.shotPrompt ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="font-semibold text-sm">3</span>
                  )}
                </div>
                <div className="text-left">
                  <h4 className="font-semibold">镜头提示词生成</h4>
                  <p className="text-xs text-muted-foreground">
                    整合所有信息,生成最终的AI绘画提示词
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
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateShotPrompt}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span>重新生成</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    {canGeneratePrompt ? '准备就绪,可以生成最终提示词' : '请先完成动作描述'}
                  </p>
                  <Button
                    onClick={generateShotPrompt}
                    disabled={!canGeneratePrompt || isGenerating}
                    className="gap-2"
                  >
                    {isGenerating && generatingStep === 'shot_prompt' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>生成中...</span>
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
        </Accordion>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t">
          <Button
            variant="outline"
            onClick={generateAll}
            disabled={isGenerating || isBatchGenerating || isCompleted}
            className="gap-2"
          >
            {isBatchGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>批量生成中...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>一键生成全部</span>
              </>
            )}
          </Button>

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
          <li>• <strong>渐进式生成</strong>: 按顺序完成三个阶段,每步都可手动编辑优化</li>
          <li>• <strong>上下文保持</strong>: AI会自动参考前面分镜,保持连贯性</li>
          <li>• <strong>提示词质量</strong>: 最终提示词融合了风格、角色、场景、动作的全部信息</li>
          <li>• <strong>批量处理</strong>: 完成所有分镜后可在导出页面统一查看和管理</li>
        </ul>
      </Card>
    </div>
  );
}
