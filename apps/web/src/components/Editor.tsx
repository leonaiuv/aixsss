import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { isApiMode } from '@/lib/runtime/mode';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  CheckCircle2,
  History,
  BarChart3,
  Download,
  Layers,
  GitCompare,
} from 'lucide-react';
import { BasicSettings } from './editor/BasicSettings';
import { SceneGeneration } from './editor/SceneGeneration';
import { SceneRefinement } from './editor/SceneRefinement';
import { PromptExport } from './editor/PromptExport';
import { VersionHistory } from './editor/VersionHistory';
import { StatisticsPanel } from './editor/StatisticsPanel';
import { DataExporter } from './editor/DataExporter';
import { BatchOperations } from './editor/BatchOperations';
import { SceneComparison } from './editor/SceneComparison';
import { AIFactory } from '@/lib/ai/factory';
import { getSkillByName, parseDialoguesFromText } from '@/lib/ai/skills';
import {
  logAICall,
  updateLogProgress,
  updateLogWithError,
  updateLogWithResponse,
} from '@/lib/ai/debugLogger';
import { fillPromptTemplate, buildCharacterContext } from '@/lib/ai/contextBuilder';
import { shouldInjectAtSceneDescription, getInjectionSettings } from '@/lib/ai/worldViewInjection';
import { isStructuredOutput, mergeTokenUsage, requestFormatFix } from '@/lib/ai/outputFixer';
import { migrateOldStyleToConfig } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { getWorkflowStateLabel } from '@/lib/workflowLabels';
import { EpisodeWorkflow } from './editor/EpisodeWorkflow';

type EditorStep = 'basic' | 'generation' | 'refinement' | 'export';
type ActiveDialog = 'none' | 'version' | 'statistics' | 'export' | 'batch' | 'compare';

export function Editor() {
  // 生产默认 API 模式：启用 Episode Planning 全流程 UI
  return isApiMode() ? <EpisodeWorkflow /> : <LegacyEditor />;
}

function LegacyEditor() {
  const { currentProject, updateProject } = useProjectStore();
  const { scenes, updateScene, deleteScene } = useStoryboardStore();
  const { config, activeProfileId } = useConfigStore();
  const { characters } = useCharacterStore();
  const { elements: worldViewElements } = useWorldViewStore();
  const {
    startBatchGenerating,
    stopBatchGenerating,
    updateBatchOperations,
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

    if (state === 'IDLE' || state === 'DATA_COLLECTING' || state === 'DATA_COLLECTED') {
      setActiveStep('basic');
    } else if (
      state === 'SCENE_LIST_GENERATING' ||
      state === 'SCENE_LIST_EDITING' ||
      state === 'SCENE_LIST_CONFIRMED'
    ) {
      setActiveStep('generation');
    } else if (state === 'SCENE_PROCESSING') {
      setActiveStep('refinement');
    } else if (state === 'ALL_SCENES_COMPLETE' || state === 'EXPORTING') {
      setActiveStep('export');
    }
  }, [currentProject]);



  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground">请先选择或创建一个项目</p>
      </div>
    );
  }

  const workflowLabel = getWorkflowStateLabel(currentProject.workflowState);

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
  const projectCharacters = characters.filter((c) => c.projectId === currentProject?.id);

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
      cancelRequested: false,
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
    let cancelled = false;

    const waitForResumeOrCancel = async (): Promise<boolean> => {
      while (true) {
        const { batchOperations } = useAIProgressStore.getState();
        if (batchOperations.cancelRequested) return false;
        if (!batchOperations.isPaused) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };

    outer: for (let i = 0; i < sceneIds.length; i++) {
      if (!(await waitForResumeOrCancel())) {
        cancelled = true;
        break outer;
      }
      const sceneId = sceneIds[i];
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) continue;

      // 更新当前处理的分镜信息
      updateBatchOperations({
        currentSceneId: sceneId,
        currentScene: i + 1,
        progress: Math.round((i / sceneIds.length) * 100),
        statusMessage: `正在处理分镜 ${i + 1}/${sceneIds.length}...`,
      });

      try {
        if (!(await waitForResumeOrCancel())) {
          cancelled = true;
          break outer;
        }

        // 生成场景锚点
        if (!scene.sceneDescription) {
          const sceneSkill = getSkillByName('generate_scene_desc');
          if (sceneSkill) {
            const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
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

            const messages = [{ role: 'user', content: prompt }] as const;
            let logId = '';

            try {
              logId = logAICall('scene_description', {
                skillName: sceneSkill.name,
                promptTemplate: sceneSkill.promptTemplate,
                filledPrompt: prompt,
                messages: [...messages],
                context: {
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  style: styleFullPrompt,
                  protagonist: currentProject.protagonist,
                  summary: currentProject.summary,
                  sceneId,
                  sceneOrder: scene.order,
                  sceneSummary: scene.summary,
                  prevSceneSummary: prevScene?.summary,
                  worldViewInjected: shouldInjectWorldView,
                },
                config: {
                  provider: config.provider,
                  model: config.model,
                  maxTokens: sceneSkill.maxTokens,
                  profileId: activeProfileId || undefined,
                },
              });

              updateLogProgress(logId, 30, '正在生成场景锚点...');
              const response = await client.chat([...messages]);

              let finalContent = response.content.trim();
              let mergedTokenUsage = response.tokenUsage;

              updateLogProgress(logId, 60, '正在检查输出格式...');

              const cancelRequestedNow =
                useAIProgressStore.getState().batchOperations.cancelRequested;
              if (
                !cancelRequestedNow &&
                finalContent &&
                !isStructuredOutput('scene_anchor', finalContent)
              ) {
                updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
                try {
                  const fixed = await requestFormatFix({
                    chat: (messages2, options) => client.chat(messages2, options),
                    type: 'scene_anchor',
                    raw: finalContent,
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
                  console.warn('场景锚点输出纠偏失败，已回退到原始输出:', fixError);
                  updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
                }
              }

              updateLogProgress(logId, 80, '正在保存结果...');

              updateLogWithResponse(logId, {
                content: finalContent,
                tokenUsage: mergedTokenUsage,
              });

              updateScene(currentProject.id, sceneId, {
                sceneDescription: finalContent,
                status: 'scene_confirmed',
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '生成失败';
              if (logId) updateLogWithError(logId, errorMessage);
              throw error;
            }
          }
        }

        if (!(await waitForResumeOrCancel())) {
          cancelled = true;
          break outer;
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes1 } = useStoryboardStore.getState();
        const latestScene1 = updatedScenes1.find((s) => s.id === sceneId);

        // 生成关键帧提示词
        if (latestScene1?.sceneDescription && !latestScene1.shotPrompt) {
          const keyframeSkill = getSkillByName('generate_keyframe_prompt');
          if (keyframeSkill) {
            const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
            const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined;
            const prompt = fillPromptTemplate(keyframeSkill.promptTemplate, {
              artStyle: currentProject.artStyleConfig,
              characters: projectCharacters,
              worldViewElements: shouldInjectWorldView ? worldViewElements : [],
              sceneDescription: latestScene1.sceneDescription,
              sceneSummary: latestScene1.summary,
              prevSceneSummary: prevScene?.summary,
            });

            const messages = [{ role: 'user', content: prompt }] as const;
            let logId = '';

            try {
              logId = logAICall('keyframe_prompt', {
                skillName: keyframeSkill.name,
                promptTemplate: keyframeSkill.promptTemplate,
                filledPrompt: prompt,
                messages: [...messages],
                context: {
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  style: styleFullPrompt,
                  protagonist: currentProject.protagonist,
                  summary: currentProject.summary,
                  sceneId,
                  sceneOrder: scene.order,
                  sceneSummary: latestScene1.summary,
                  prevSceneSummary: prevScene?.summary,
                  sceneDescription: latestScene1.sceneDescription,
                },
                config: {
                  provider: config.provider,
                  model: config.model,
                  maxTokens: keyframeSkill.maxTokens,
                  profileId: activeProfileId || undefined,
                },
              });

              updateLogProgress(logId, 30, '正在生成关键帧提示词...');
              const response = await client.chat([...messages]);

              let finalContent = response.content.trim();
              let mergedTokenUsage = response.tokenUsage;

              updateLogProgress(logId, 60, '正在检查输出格式...');

              const cancelRequestedNow =
                useAIProgressStore.getState().batchOperations.cancelRequested;
              if (
                !cancelRequestedNow &&
                finalContent &&
                !isStructuredOutput('keyframe_prompt', finalContent)
              ) {
                updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
                try {
                  const fixed = await requestFormatFix({
                    chat: (messages2, options) => client.chat(messages2, options),
                    type: 'keyframe_prompt',
                    raw: finalContent,
                  });

                  mergedTokenUsage = mergeTokenUsage(mergedTokenUsage, fixed.tokenUsage);

                  const fixedContent = fixed.content.trim();
                  if (fixedContent && isStructuredOutput('keyframe_prompt', fixedContent)) {
                    finalContent = fixedContent;
                    updateLogProgress(logId, 75, '纠偏完成，正在保存结果...');
                  } else {
                    updateLogProgress(logId, 75, '纠偏未生效，正在保存原始输出...');
                  }
                } catch (fixError) {
                  console.warn('关键帧输出纠偏失败，已回退到原始输出:', fixError);
                  updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
                }
              }

              updateLogProgress(logId, 80, '正在保存结果...');

              updateLogWithResponse(logId, {
                content: finalContent,
                tokenUsage: mergedTokenUsage,
              });

              updateScene(currentProject.id, sceneId, {
                shotPrompt: finalContent,
                status: 'keyframe_confirmed',
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '生成失败';
              if (logId) updateLogWithError(logId, errorMessage);
              throw error;
            }
          }
        }

        if (!(await waitForResumeOrCancel())) {
          cancelled = true;
          break outer;
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes2 } = useStoryboardStore.getState();
        const latestScene2 = updatedScenes2.find((s) => s.id === sceneId);

        // 生成时空/运动提示词
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

            const messages = [{ role: 'user', content: prompt }] as const;
            let logId = '';

            try {
              logId = logAICall('motion_prompt', {
                skillName: motionSkill.name,
                promptTemplate: motionSkill.promptTemplate,
                filledPrompt: prompt,
                messages: [...messages],
                context: {
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  style: styleFullPrompt,
                  protagonist: currentProject.protagonist,
                  summary: currentProject.summary,
                  sceneId,
                  sceneOrder: scene.order,
                  sceneSummary: latestScene2.summary,
                  sceneDescription: latestScene2.sceneDescription,
                  shotPrompt: latestScene2.shotPrompt,
                },
                config: {
                  provider: config.provider,
                  model: config.model,
                  maxTokens: motionSkill.maxTokens,
                  profileId: activeProfileId || undefined,
                },
              });

              updateLogProgress(logId, 30, '正在生成时空/运动提示词...');
              const response = await client.chat([...messages]);

              let finalContent = response.content.trim();
              let mergedTokenUsage = response.tokenUsage;

              updateLogProgress(logId, 60, '正在检查输出格式...');

              const cancelRequestedNow =
                useAIProgressStore.getState().batchOperations.cancelRequested;
              if (
                !cancelRequestedNow &&
                finalContent &&
                !isStructuredOutput('motion_prompt', finalContent)
              ) {
                updateLogProgress(logId, 65, '输出格式不规范，正在纠偏...');
                try {
                  const fixed = await requestFormatFix({
                    chat: (messages2, options) => client.chat(messages2, options),
                    type: 'motion_prompt',
                    raw: finalContent,
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
                  console.warn('时空/运动提示词输出纠偏失败，已回退到原始输出:', fixError);
                  updateLogProgress(logId, 75, '纠偏失败，正在保存原始输出...');
                }
              }

              updateLogProgress(logId, 80, '正在保存结果...');

              updateLogWithResponse(logId, {
                content: finalContent,
                tokenUsage: mergedTokenUsage,
              });

              updateScene(currentProject.id, sceneId, {
                motionPrompt: finalContent,
                status: 'motion_generating',
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '生成失败';
              if (logId) updateLogWithError(logId, errorMessage);
              throw error;
            }
          }
        }

        if (!(await waitForResumeOrCancel())) {
          cancelled = true;
          break outer;
        }

        // 获取更新后的场景数据
        const { scenes: updatedScenes3 } = useStoryboardStore.getState();
        const latestScene3 = updatedScenes3.find((s) => s.id === sceneId);

        if (!(await waitForResumeOrCancel())) {
          cancelled = true;
          break outer;
        }

        // 生成台词
        if (
          latestScene3?.motionPrompt &&
          (!latestScene3.dialogues || latestScene3.dialogues.length === 0)
        ) {
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

            const messages = [{ role: 'user', content: prompt }] as const;
            let logId = '';

            try {
              logId = logAICall('dialogue', {
                skillName: dialogueSkill.name,
                promptTemplate: dialogueSkill.promptTemplate,
                filledPrompt: prompt,
                messages: [...messages],
                context: {
                  projectId: currentProject.id,
                  projectTitle: currentProject.title,
                  style: styleFullPrompt,
                  protagonist: currentProject.protagonist,
                  summary: currentProject.summary,
                  sceneId,
                  sceneOrder: scene.order,
                  sceneSummary: scene.summary,
                  characters: characterContext,
                  sceneDescription: latestScene3.sceneDescription,
                  shotPrompt: latestScene3.shotPrompt,
                  motionPrompt: latestScene3.motionPrompt,
                },
                config: {
                  provider: config.provider,
                  model: config.model,
                  maxTokens: dialogueSkill.maxTokens,
                  profileId: activeProfileId || undefined,
                },
              });

              updateLogProgress(logId, 30, '正在生成台词...');
              const response = await client.chat([...messages]);
              updateLogProgress(logId, 80, '正在解析台词...');

              updateLogWithResponse(logId, {
                content: response.content,
                tokenUsage: response.tokenUsage,
              });

              const dialogues = parseDialoguesFromText(response.content);

              updateScene(currentProject.id, sceneId, {
                dialogues,
                status: 'completed',
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '生成失败';
              if (logId) updateLogWithError(logId, errorMessage);
              throw error;
            }
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

    const processedCount = successCount + failCount;

    // 更新批量操作完成状态
    updateBatchOperations({
      isProcessing: false,
      isPaused: false,
      cancelRequested: false,
      currentSceneId: null,
      currentScene: cancelled ? processedCount : sceneIds.length,
      progress: cancelled ? Math.round((processedCount / Math.max(1, sceneIds.length)) * 100) : 100,
      statusMessage: cancelled
        ? `已停止：已处理 ${processedCount}/${sceneIds.length}（成功 ${successCount}，失败 ${failCount}）`
        : `完成！成功 ${successCount} 个，失败 ${failCount} 个`,
    });

    toast({
      title: cancelled ? '批量生成已停止' : '批量生成完成',
      description: cancelled
        ? `已处理: ${processedCount}/${sceneIds.length}，成功: ${successCount}，失败: ${failCount}`
        : `成功: ${successCount}, 失败: ${failCount}`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });
  };

  const handleBatchEdit = (sceneIds: string[], updates: Partial<(typeof scenes)[0]>) => {
    sceneIds.forEach((id) => {
      updateScene(currentProject.id, id, updates);
    });
  };

  const handleBatchExport = (sceneIds: string[], format: string) => {
    const selectedScenes = scenes.filter((s) => sceneIds.includes(s.id));
    if (selectedScenes.length === 0) return;

    let content = '';
    const filename = `batch_export_${Date.now()}`;

    if (format === 'markdown') {
      content = selectedScenes
        .map((scene, index) => {
          const dialoguesText =
            scene.dialogues
              ?.map((d) => `- **${d.characterName || '旁白'}**: ${d.content}`)
              .join('\n') || '(未生成)';
          return (
            `## 分镜 ${index + 1}: ${scene.summary}\n\n` +
            `### 场景锚点（Scene Anchor）\n${scene.sceneDescription || '(未生成)'}\n\n` +
            `### 关键帧提示词（KF0/KF1/KF2）
\`\`\`
${scene.shotPrompt || '(未生成)'}
\`\`\`

` +
            `### 时空/运动提示词
\`\`\`
${scene.motionPrompt || '(未生成)'}
\`\`\`

` +
            `### 台词
${dialoguesText}

---
`
          );
        })
        .join('\n');

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
      content = selectedScenes
        .map((scene, index) => {
          const dialoguesText =
            scene.dialogues?.map((d) => `${d.characterName || '旁白'}: ${d.content}`).join('; ') ||
            '(未生成)';
          return (
            `[分镜 ${index + 1}] ${scene.summary}\n` +
            `锚点: ${scene.sceneDescription || '(未生成)'}\n` +
            `关键帧: ${scene.shotPrompt || '(未生成)'}\n` +
            `运动: ${scene.motionPrompt || '(未生成)'}\n` +
            `台词: ${dialoguesText}\n\n`
          );
        })
        .join('');

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
    sceneIds.forEach((id) => {
      deleteScene(currentProject.id, id);
    });
  };

  const steps = [
    {
      id: 'basic' as EditorStep,
      name: '基础设定',
      states: ['IDLE', 'DATA_COLLECTING', 'DATA_COLLECTED'],
    },
    {
      id: 'generation' as EditorStep,
      name: '分镜生成',
      states: ['SCENE_LIST_GENERATING', 'SCENE_LIST_EDITING', 'SCENE_LIST_CONFIRMED'],
    },
    { id: 'refinement' as EditorStep, name: '分镜细化', states: ['SCENE_PROCESSING'] },
    {
      id: 'export' as EditorStep,
      name: '提示词导出',
      states: ['ALL_SCENES_COMPLETE', 'EXPORTING'],
    },
  ];

  const getStepStatus = (step: (typeof steps)[0]) => {
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
    const stepMaxIndex = Math.max(...step.states.map((s) => allStates.indexOf(s)));

    if (currentIndex > stepMaxIndex) {
      return 'completed';
    }

    return 'pending';
  };

  const handleStepClick = (stepId: EditorStep) => {
    const step = steps.find((s) => s.id === stepId);
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
      <div className="flex items-center justify-between pb-6 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{currentProject.title}</h2>
          <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">
            <span title={currentProject.workflowState}>{workflowLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveDialog('version')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">版本历史</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveDialog('statistics')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">统计分析</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveDialog('compare')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <GitCompare className="h-4 w-4" />
            <span className="hidden sm:inline">分镜对比</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveDialog('batch')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">批量操作</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveDialog('export')}
            className="gap-2 shadow-sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">导出数据</span>
          </Button>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="grid grid-cols-[200px_1fr] gap-8 min-h-[calc(100vh-200px)]">
        {/* 左侧步骤导航 */}
        <div className="h-fit sticky top-0 py-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 px-2">创作流程</h3>
          <div className="space-y-1">
            {steps.map((step, index) => {
              const status = getStepStatus(step);
              const isClickable = status === 'current' || status === 'completed';
              const isCurrent = status === 'current';

              return (
                <button
                  key={step.id}
                  onClick={() => handleStepClick(step.id)}
                  disabled={!isClickable}
                  className={cn(
                    "flex w-full items-center gap-3 px-2 py-2 text-sm font-medium rounded-md transition-colors",
                    isCurrent ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    !isClickable && "opacity-50 cursor-not-allowed hover:bg-transparent"
                  )}
                >
                  <div className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                    isCurrent ? "border-primary bg-primary text-primary-foreground" : 
                    status === 'completed' ? "border-primary text-primary" : "border-muted-foreground"
                  )}>
                    {status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                  </div>
                  {step.name}
                </button>
              );
            })}
          </div>

          <div className="mt-8 px-2">
             <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">当前项目</p>
                <p className="line-clamp-2">{currentProject.title}</p>
             </div>
          </div>
        </div>

        {/* 右侧主内容区 */}
        <div className="space-y-6 py-2">
          {activeStep === 'basic' && <BasicSettings />}
          {activeStep === 'generation' && <SceneGeneration />}
          {activeStep === 'refinement' && <SceneRefinement />}
          {activeStep === 'export' && <PromptExport />}
        </div>
      </div>

      {/* 版本历史对话框 */}
      <Dialog
        open={activeDialog === 'version'}
        onOpenChange={(open) => setActiveDialog(open ? 'version' : 'none')}
      >
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
      <Dialog
        open={activeDialog === 'statistics'}
        onOpenChange={(open) => setActiveDialog(open ? 'statistics' : 'none')}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>统计分析</DialogTitle>
          </DialogHeader>
          <StatisticsPanel
            projectId={currentProject.id}
            onOpenDataExport={() => setActiveDialog('export')}
          />
        </DialogContent>
      </Dialog>

      {/* 分镜对比对话框 */}
      <Dialog
        open={activeDialog === 'compare'}
        onOpenChange={(open) => setActiveDialog(open ? 'compare' : 'none')}
      >
        <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>分镜对比</DialogTitle>
          </DialogHeader>
          <SceneComparison
            scenes={scenes}
            onMerge={(targetId, sourceContent) => {
              updateScene(currentProject.id, targetId, sourceContent);
              toast({
                title: '已合并内容',
                description: '已将选择的字段复制到目标分镜',
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 批量操作对话框 */}
      <Dialog
        open={activeDialog === 'batch'}
        onOpenChange={(open) => setActiveDialog(open ? 'batch' : 'none')}
      >
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
      <Dialog
        open={activeDialog === 'export'}
        onOpenChange={(open) => setActiveDialog(open ? 'export' : 'none')}
      >
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
