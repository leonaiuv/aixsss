import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { CheckCircle2, Circle, History, BarChart3, Download, Layers } from 'lucide-react';
import { BasicSettings } from './editor/BasicSettings';
import { SceneGeneration } from './editor/SceneGeneration';
import { SceneRefinement } from './editor/SceneRefinement';
import { PromptExport } from './editor/PromptExport';
import { VersionHistory } from './editor/VersionHistory';
import { StatisticsPanel } from './editor/StatisticsPanel';
import { DataExporter } from './editor/DataExporter';
import { BatchOperations } from './editor/BatchOperations';
import { AIFactory } from '@/lib/ai/factory';
import { getSkillByName, parseDialoguesFromText } from '@/lib/ai/skills';
import { fillPromptTemplate, buildCharacterContext } from '@/lib/ai/contextBuilder';
import { shouldInjectAtSceneDescription, getInjectionSettings } from '@/lib/ai/worldViewInjection';
import { migrateOldStyleToConfig } from '@/types';
import { useToast } from '@/hooks/use-toast';

type EditorStep = 'basic' | 'generation' | 'refinement' | 'export';
type ActiveDialog = 'none' | 'version' | 'statistics' | 'export' | 'batch';

export function Editor() {
  const { currentProject, updateProject } = useProjectStore();
  const { scenes, updateScene, deleteScene } = useStoryboardStore();
  const { config } = useConfigStore();
  const { characters } = useCharacterStore();
  const { elements: worldViewElements } = useWorldViewStore();
  const { 
    startBatchGenerating, 
    stopBatchGenerating,
    batchOperations,
    updateBatchOperations,
    resetBatchOperations,
    setBatchSelectedScenes,
    addBatchCompletedScene,
    addBatchFailedScene,
  } = useAIProgressStore();
  const { toast } = useToast();
  const [activeStep, setActiveStep] = useState<EditorStep>('basic');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>('none');

  // 监听工作流变化自动切换步骤
  useEffect(() => {
    if (!currentProject) return;

    const state = currentProject.workflowState;
    
    if (state === 'IDLE' || state === 'DATA_COLLECTING') {
      setActiveStep('basic');
    } else if (state === 'DATA_COLLECTED' || state === 'SCENE_LIST_GENERATING' || state === 'SCENE_LIST_EDITING') {
      setActiveStep('generation');
    } else if (state === 'SCENE_LIST_CONFIRMED' || state === 'SCENE_PROCESSING') {
      setActiveStep('refinement');
    } else if (state === 'ALL_SCENES_COMPLETE' || state === 'EXPORTING') {
      setActiveStep('export');
    }
  }, [currentProject?.workflowState]);

  // 监听自定义事件来切换步骤
  useEffect(() => {
    const handleNextStep = () => {
      if (!currentProject) return;

      const state = currentProject.workflowState;
      
      if (state === 'DATA_COLLECTED') {
        setActiveStep('generation');
      } else if (state === 'SCENE_LIST_CONFIRMED' || state === 'SCENE_PROCESSING') {
        setActiveStep('refinement');
      } else if (state === 'ALL_SCENES_COMPLETE') {
        setActiveStep('export');
      }
    };

    window.addEventListener('workflow:next-step', handleNextStep);
    return () => window.removeEventListener('workflow:next-step', handleNextStep);
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">请先选择或创建一个项目</p>
      </div>
    );
  }

  // 获取项目的完整画风提示词
  const getStyleFullPrompt = (project: typeof currentProject): string => {
    if (!project) return '';
    if (project.artStyleConfig?.fullPrompt) {
      return project.artStyleConfig.fullPrompt;
    }
    if (project.style) {
      return migrateOldStyleToConfig(project.style).fullPrompt;
    }
    return '';
  };

  // 获取项目角色
  const projectCharacters = characters.filter(c => c.projectId === currentProject?.id);

  // 版本恢复处理
  const handleVersionRestore = (snapshot: Partial<typeof currentProject>) => {
    if (snapshot && currentProject) {
      updateProject(currentProject.id, snapshot);
    }
  };

  // 批量操作处理 - 实现真正的批量生成逻辑
  const handleBatchGenerate = async (sceneIds: string[]) => {
    if (!config) {
      toast({
        title: '配置缺失',
        description: '请先配置AI服务',
        variant: 'destructive',
      });
      return;
    }

    if (!currentProject) return;

    // 设置全局批量生成状态，防止交叉生成
    startBatchGenerating('batch_panel');
    
    // 初始化批量操作状态
    setBatchSelectedScenes(sceneIds);
    updateBatchOperations({
      isProcessing: true,
      isPaused: false,
      progress: 0,
      currentScene: 0,
      operationType: 'generate',
      startTime: Date.now(),
      completedScenes: [],
      failedScenes: [],
      currentSceneId: null,
      statusMessage: '准备开始批量生成...',
    });

    toast({
      title: '开始批量生成',
      description: `正在生成 ${sceneIds.length} 个分镜...`,
    });

    const client = AIFactory.createClient(config);
    const styleFullPrompt = getStyleFullPrompt(currentProject);
    const injectionSettings = getInjectionSettings(currentProject.id);
    const shouldInjectWorldView = shouldInjectAtSceneDescription(injectionSettings);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sceneIds.length; i++) {
      const sceneId = sceneIds[i];
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) continue;

      // 更新当前处理的分镜信息
      updateBatchOperations({
        currentSceneId: sceneId,
        statusMessage: `正在处理分镜 ${i + 1}/${sceneIds.length}...`,
      });

      try {
        // 生成场景描述
        if (!scene.sceneDescription) {
          const sceneSkill = getSkillByName('generate_scene_desc');
          if (sceneSkill) {
            const sceneIndex = scenes.findIndex(s => s.id === sceneId);
            const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined;
            
            const prompt = fillPromptTemplate(sceneSkill.promptTemplate, {
              artStyle: currentProject.artStyleConfig,
              characters: projectCharacters,
              worldViewElements: shouldInjectWorldView ? worldViewElements : [],
              protagonist: currentProject.protagonist,
              sceneSummary: scene.summary,
              prevSceneSummary: prevScene?.summary,
              summary: currentProject.summary,
            });

            const response = await client.chat([{ role: 'user', content: prompt }]);
            updateScene(currentProject.id, sceneId, {
              sceneDescription: response.content.trim(),
              status: 'scene_confirmed',
            });
          }
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes1 } = useStoryboardStore.getState();
        const latestScene1 = updatedScenes1.find(s => s.id === sceneId);

        // 生成关键帧提示词
        if (latestScene1?.sceneDescription && !latestScene1.shotPrompt) {
          const keyframeSkill = getSkillByName('generate_keyframe_prompt');
          if (keyframeSkill) {
            const prompt = fillPromptTemplate(keyframeSkill.promptTemplate, {
              artStyle: currentProject.artStyleConfig,
              characters: projectCharacters,
              worldViewElements: shouldInjectWorldView ? worldViewElements : [],
              sceneDescription: latestScene1.sceneDescription,
            });

            const response = await client.chat([{ role: 'user', content: prompt }]);
            updateScene(currentProject.id, sceneId, {
              shotPrompt: response.content.trim(),
              status: 'keyframe_confirmed',
            });
          }
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes2 } = useStoryboardStore.getState();
        const latestScene2 = updatedScenes2.find(s => s.id === sceneId);

        // 生成时空提示词
         if (latestScene2?.shotPrompt && !latestScene2.motionPrompt) {
           const motionSkill = getSkillByName('generate_motion_prompt');
           if (motionSkill) {
             const prompt = fillPromptTemplate(motionSkill.promptTemplate, {
               artStyle: currentProject.artStyleConfig,
               characters: projectCharacters,
               worldViewElements,
               sceneDescription: latestScene2.sceneDescription,
               shotPrompt: latestScene2.shotPrompt,
               sceneSummary: latestScene2.summary,
             });

             const response = await client.chat([{ role: 'user', content: prompt }]);
             updateScene(currentProject.id, sceneId, {
               motionPrompt: response.content.trim(),
              status: 'motion_generating',
            });
          }
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes3 } = useStoryboardStore.getState();
        const latestScene3 = updatedScenes3.find(s => s.id === sceneId);

        // 生成台词
        if (latestScene3?.motionPrompt && (!latestScene3.dialogues || latestScene3.dialogues.length === 0)) {
          const dialogueSkill = getSkillByName('generate_dialogue');
          if (dialogueSkill) {
            const characterContext = buildCharacterContext(projectCharacters);
            const prompt = fillPromptTemplate(dialogueSkill.promptTemplate, {
              artStyle: currentProject.artStyleConfig,
              characters: projectCharacters,
              worldViewElements,
              sceneDescription: latestScene3.sceneDescription || '',
              sceneSummary: scene.summary,
              shotPrompt: latestScene3.shotPrompt,
              motionPrompt: latestScene3.motionPrompt,
            });

            const response = await client.chat([{ role: 'user', content: prompt }]);
            const dialogues = parseDialoguesFromText(response.content);
            
            updateScene(currentProject.id, sceneId, {
              dialogues,
              status: 'completed',
            });
          }
        }

        successCount++;
        addBatchCompletedScene(sceneId);
      } catch (err) {
        console.error(`生成分镜 ${sceneId} 失败:`, err);
        failCount++;
        addBatchFailedScene(sceneId);
      }
    }

    // 清除全局批量生成状态
    stopBatchGenerating();
    
    // 更新批量操作完成状态
    updateBatchOperations({
      isProcessing: false,
      currentSceneId: null,
      statusMessage: `完成！成功 ${successCount} 个，失败 ${failCount} 个`,
      progress: 100,
    });

    toast({
      title: '批量生成完成',
      description: `成功: ${successCount}, 失败: ${failCount}`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });
  };

  const handleBatchEdit = (sceneIds: string[], updates: Partial<typeof scenes[0]>) => {
    sceneIds.forEach(id => {
      updateScene(currentProject.id, id, updates);
    });
  };

  const handleBatchExport = (sceneIds: string[], format: string) => {
    const selectedScenes = scenes.filter(s => sceneIds.includes(s.id));
    if (selectedScenes.length === 0) return;

    let content = '';
    const filename = `batch_export_${Date.now()}`;

    if (format === 'markdown') {
      content = selectedScenes.map((scene, index) => {
        const dialoguesText = scene.dialogues?.map(d => `- **${d.characterName || '旁白'}**: ${d.content}`).join('\n') || '(未生成)';
        return `## 分镜 ${index + 1}: ${scene.summary}\n\n` +
          `### 场景描述\n${scene.sceneDescription || '(未生成)'}\n\n` +
          `### 关键帧提示词
\`\`\`
${scene.shotPrompt || '(未生成)'}
\`\`\`

` +
          `### 时空提示词
\`\`\`
${scene.motionPrompt || '(未生成)'}
\`\`\`

` +
          `### 台词
${dialoguesText}

---
`;
      }).join('\n');

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'json') {
      content = JSON.stringify(selectedScenes, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'txt') {
      content = selectedScenes.map((scene, index) => {
        const dialoguesText = scene.dialogues?.map(d => `${d.characterName || '旁白'}: ${d.content}`).join('; ') || '(未生成)';
        return `[分镜 ${index + 1}] ${scene.summary}\n` +
          `场景: ${scene.sceneDescription || '(未生成)'}\n` +
          `关键帧: ${scene.shotPrompt || '(未生成)'}\n` +
          `时空: ${scene.motionPrompt || '(未生成)'}\n` +
          `台词: ${dialoguesText}\n\n`;
      }).join('');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }

    toast({
      title: '导出成功',
      description: `已导出 ${selectedScenes.length} 个分镜`,
    });
  };

  const handleBatchDelete = (sceneIds: string[]) => {
    sceneIds.forEach(id => {
      deleteScene(currentProject.id, id);
    });
  };

  const steps = [
    { id: 'basic' as EditorStep, name: '基础设定', states: ['IDLE', 'DATA_COLLECTING', 'DATA_COLLECTED'] },
    { id: 'generation' as EditorStep, name: '分镜生成', states: ['SCENE_LIST_GENERATING', 'SCENE_LIST_EDITING', 'SCENE_LIST_CONFIRMED'] },
    { id: 'refinement' as EditorStep, name: '分镜细化', states: ['SCENE_PROCESSING'] },
    { id: 'export' as EditorStep, name: '提示词导出', states: ['ALL_SCENES_COMPLETE', 'EXPORTING'] },
  ];

  const getStepStatus = (step: typeof steps[0]) => {
    const currentState = currentProject.workflowState;
    
    // 检查是否是当前步骤
    if (step.states.includes(currentState)) {
      return 'current';
    }
    
    // 检查是否已完成
    const allStates = [
      'IDLE',
      'DATA_COLLECTING',
      'DATA_COLLECTED',
      'SCENE_LIST_GENERATING',
      'SCENE_LIST_EDITING',
      'SCENE_LIST_CONFIRMED',
      'SCENE_PROCESSING',
      'ALL_SCENES_COMPLETE',
      'EXPORTING',
    ];
    
    const currentIndex = allStates.indexOf(currentState);
    const stepMaxIndex = Math.max(...step.states.map(s => allStates.indexOf(s)));
    
    if (currentIndex > stepMaxIndex) {
      return 'completed';
    }
    
    return 'pending';
  };

  const handleStepClick = (stepId: EditorStep) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    
    const status = getStepStatus(step);
    // 只允许点击当前或已完成的步骤
    if (status === 'current' || status === 'completed') {
      setActiveStep(stepId);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部工具栏 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{currentProject.title}</h2>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
              {currentProject.workflowState}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDialog('version')}
              className="gap-2"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">版本历史</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDialog('statistics')}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">统计分析</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDialog('batch')}
              className="gap-2"
            >
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">批量操作</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDialog('export')}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">导出数据</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 主内容区域 */}
      <div className="grid grid-cols-[240px_1fr] gap-6 min-h-[calc(100vh-260px)]">
      {/* 左侧步骤导航 */}
      <Card className="p-6 h-fit sticky top-24">
        <h3 className="font-semibold mb-4">创作流程</h3>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const status = getStepStatus(step);
            const isClickable = status === 'current' || status === 'completed';
            
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
                    <div className={`w-0.5 h-8 mt-2 ${
                      status === 'completed' ? 'bg-primary' : 'bg-border'
                    }`} />
                  )}
                </div>
                <button
                  onClick={() => handleStepClick(step.id)}
                  disabled={!isClickable}
                  className={`text-left transition-colors ${
                    isClickable ? 'cursor-pointer hover:text-primary' : 'cursor-not-allowed'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    status === 'current' ? 'text-primary' : 
                    status === 'completed' ? 'text-foreground' : 
                    'text-muted-foreground'
                  }`}>
                    {step.name}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 pt-6 border-t space-y-2">
          <p className="text-xs text-muted-foreground">当前项目</p>
          <p className="font-medium text-sm">{currentProject.title}</p>
        </div>
      </Card>

      {/* 右侧主内容区 */}
        <div className="space-y-6">
          {activeStep === 'basic' && <BasicSettings />}
          {activeStep === 'generation' && <SceneGeneration />}
          {activeStep === 'refinement' && <SceneRefinement />}
          {activeStep === 'export' && <PromptExport />}
        </div>
      </div>

      {/* 版本历史对话框 */}
      <Dialog open={activeDialog === 'version'} onOpenChange={(open) => setActiveDialog(open ? 'version' : 'none')}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>版本历史</DialogTitle>
          </DialogHeader>
          <VersionHistory
            projectId={currentProject.id}
            targetType="project"
            onRestore={handleVersionRestore}
          />
        </DialogContent>
      </Dialog>

      {/* 统计分析对话框 */}
      <Dialog open={activeDialog === 'statistics'} onOpenChange={(open) => setActiveDialog(open ? 'statistics' : 'none')}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>统计分析</DialogTitle>
          </DialogHeader>
          <StatisticsPanel projectId={currentProject.id} />
        </DialogContent>
      </Dialog>

      {/* 批量操作对话框 */}
      <Dialog open={activeDialog === 'batch'} onOpenChange={(open) => setActiveDialog(open ? 'batch' : 'none')}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>批量操作</DialogTitle>
          </DialogHeader>
          <BatchOperations
            scenes={scenes}
            onBatchGenerate={handleBatchGenerate}
            onBatchEdit={handleBatchEdit}
            onBatchExport={handleBatchExport}
            onBatchDelete={handleBatchDelete}
          />
        </DialogContent>
      </Dialog>

      {/* 数据导出对话框 */}
      <Dialog open={activeDialog === 'export'} onOpenChange={(open) => setActiveDialog(open ? 'export' : 'none')}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>数据导出</DialogTitle>
          </DialogHeader>
          <DataExporter projects={[currentProject]} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
