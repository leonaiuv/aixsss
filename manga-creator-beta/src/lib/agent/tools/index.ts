import { tool } from 'ai';
import {
  generateScenesInputSchema,
  refineSceneInputSchema,
  batchRefineInputSchema,
  setProjectInfoInputSchema,
  exportPromptsInputSchema,
  createProjectInputSchema,
  getProjectStateInputSchema,
  type GenerateScenesInput,
  type RefineSceneInput,
  type BatchRefineInput,
  type SetProjectInfoInput,
  type ExportPromptsInput,
} from './schemas';
import {
  generateScenesWithAI,
  refineSceneWithAI,
  batchRefineWithAI,
  formatExportData,
  type ExportData,
} from '../services/ai-service';
import {
  getMemoryCheckpointStore,
  createEmptyCheckpoint,
  type ProjectCheckpoint,
} from '@/lib/checkpoint/store';

// 获取当前项目状态的辅助函数
let currentProjectId: string | null = null;

/**
 * 重置当前项目 ID（仅用于测试）
 */
export function resetCurrentProjectId(): void {
  currentProjectId = null;
}

/**
 * 获取当前项目 ID（仅用于测试）
 */
export function getCurrentProjectId(): string | null {
  return currentProjectId;
}

/**
 * 创建项目工具
 */
export const createProjectTool = tool({
  description: '创建新的漫剧项目',
  inputSchema: createProjectInputSchema,
  execute: async ({ title }: { title: string }) => {
    const projectId = `project-${Date.now()}`;
    const threadId = `thread-${Date.now()}`;
    
    // 创建并保存检查点
    const store = getMemoryCheckpointStore();
    const checkpoint = createEmptyCheckpoint(projectId, threadId);
    checkpoint.title = title;
    checkpoint.workflowState = 'COLLECTING_BASIC_INFO';
    await store.save(checkpoint);
    
    currentProjectId = projectId;
    
    return {
      success: true,
      data: {
        projectId,
        title,
        createdAt: new Date().toISOString(),
      },
      message: `项目「${title}」创建成功！请告诉我故事的简介、画风和主角信息。`,
    };
  },
});

/**
 * 获取项目状态工具
 */
export const getProjectStateTool = tool({
  description: '获取当前项目的状态信息',
  inputSchema: getProjectStateInputSchema,
  execute: async ({ projectId }: { projectId?: string }) => {
    const store = getMemoryCheckpointStore();
    const targetId = projectId ?? currentProjectId;
    
    if (!targetId) {
      return {
        success: false,
        error: '未指定项目 ID 且无当前项目',
      };
    }
    
    const checkpoint = await store.load(targetId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: `项目 ${targetId} 不存在`,
      };
    }
    
    return {
      success: true,
      data: {
        projectId: checkpoint.projectId,
        workflowState: checkpoint.workflowState,
        title: checkpoint.title,
        summary: checkpoint.summary,
        artStyle: checkpoint.artStyle,
        protagonist: checkpoint.protagonist,
        scenesCount: checkpoint.scenes.length,
        scenes: checkpoint.scenes,
      },
      message: '获取项目状态成功',
    };
  },
});

/**
 * 设置项目信息工具
 */
export const setProjectInfoTool = tool({
  description: '设置或更新项目的基础信息（标题、简介、画风、主角）',
  inputSchema: setProjectInfoInputSchema,
  execute: async (input: SetProjectInfoInput) => {
    if (!currentProjectId) {
      return {
        success: false,
        error: '请先创建项目',
      };
    }
    
    const store = getMemoryCheckpointStore();
    const checkpoint = await store.load(currentProjectId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: '项目不存在',
      };
    }
    
    // 更新检查点
    if (input.title) checkpoint.title = input.title;
    if (input.summary) checkpoint.summary = input.summary;
    if (input.artStyle) checkpoint.artStyle = input.artStyle;
    if (input.protagonist) checkpoint.protagonist = input.protagonist;
    
    // 检查是否收集完成
    if (checkpoint.title && checkpoint.summary && checkpoint.artStyle && checkpoint.protagonist) {
      checkpoint.workflowState = 'BASIC_INFO_COMPLETE';
    }
    
    await store.save(checkpoint);

    const updatedFields = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);

    return {
      success: true,
      data: input,
      message: `已更新项目信息：${updatedFields.join('、')}`,
    };
  },
});

/**
 * 生成分镜工具
 */
export const generateScenesTool = tool({
  description: '根据故事梗概生成分镜列表',
  inputSchema: generateScenesInputSchema,
  execute: async ({ count }: GenerateScenesInput) => {
    if (!currentProjectId) {
      return {
        success: false,
        error: '请先创建项目',
      };
    }
    
    const store = getMemoryCheckpointStore();
    const checkpoint = await store.load(currentProjectId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: '项目不存在',
      };
    }
    
    // 检查基础信息是否完整
    if (!checkpoint.title || !checkpoint.summary || !checkpoint.artStyle) {
      return {
        success: false,
        error: '请先完成基础信息收集（标题、简介、画风）',
      };
    }
    
    // 更新状态为生成中
    checkpoint.workflowState = 'GENERATING_SCENES';
    await store.save(checkpoint);
    
    // 调用 AI 生成分镜
    const result = await generateScenesWithAI({
      title: checkpoint.title,
      summary: checkpoint.summary,
      artStyle: checkpoint.artStyle,
      protagonist: checkpoint.protagonist,
      count,
    });
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'AI 生成分镜失败',
      };
    }
    
    // 保存分镜到检查点
    checkpoint.scenes = result.data.scenes.map(scene => ({
      ...scene,
      status: 'pending' as const,
    }));
    checkpoint.workflowState = 'SCENE_LIST_EDITING';
    await store.save(checkpoint);

    return {
      success: true,
      data: { scenes: checkpoint.scenes },
      message: `已生成 ${checkpoint.scenes.length} 个分镜，请确认后开始细化`,
    };
  },
});

/**
 * 细化分镜工具
 */
export const refineSceneTool = tool({
  description: '细化单个分镜，生成详细的场景描述和关键帧提示词',
  inputSchema: refineSceneInputSchema,
  execute: async ({ sceneId }: RefineSceneInput) => {
    if (!currentProjectId) {
      return {
        success: false,
        error: '请先创建项目',
      };
    }
    
    const store = getMemoryCheckpointStore();
    const checkpoint = await store.load(currentProjectId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: '项目不存在',
      };
    }
    
    // 查找分镜
    const sceneIndex = checkpoint.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) {
      return {
        success: false,
        error: `分镜 ${sceneId} 不存在`,
      };
    }
    
    const scene = checkpoint.scenes[sceneIndex];
    
    // 更新状态为细化中
    checkpoint.scenes[sceneIndex].status = 'in_progress';
    checkpoint.workflowState = 'REFINING_SCENES';
    await store.save(checkpoint);
    
    // 调用 AI 细化分镜
    const result = await refineSceneWithAI({
      sceneId,
      sceneSummary: scene.summary,
      artStyle: checkpoint.artStyle,
      protagonist: checkpoint.protagonist,
      projectTitle: checkpoint.title,
    });
    
    if (!result.success || !result.data) {
      checkpoint.scenes[sceneIndex].status = 'error';
      checkpoint.scenes[sceneIndex].error = result.error;
      await store.save(checkpoint);
      return {
        success: false,
        error: result.error ?? 'AI 细化分镜失败',
      };
    }
    
    // 更新分镜数据
    checkpoint.scenes[sceneIndex] = {
      ...scene,
      sceneDescription: result.data.sceneDescription,
      keyframePrompt: result.data.keyframePrompt,
      spatialPrompt: result.data.spatialPrompt,
      status: 'completed',
    };
    
    // 检查是否所有分镜都完成
    const allCompleted = checkpoint.scenes.every(s => s.status === 'completed');
    if (allCompleted) {
      checkpoint.workflowState = 'ALL_SCENES_COMPLETE';
    }
    
    await store.save(checkpoint);
    
    return {
      success: true,
      data: {
        sceneId,
        sceneDescription: result.data.sceneDescription,
        keyframePrompt: result.data.keyframePrompt,
        spatialPrompt: result.data.spatialPrompt,
        fullPrompt: result.data.fullPrompt,
        status: 'completed',
      },
      message: `分镜 ${scene.order} 细化完成`,
    };
  },
});

/**
 * 批量细化分镜工具
 */
export const batchRefineScenesTool = tool({
  description: '批量细化多个分镜',
  inputSchema: batchRefineInputSchema,
  execute: async ({ sceneIds }: BatchRefineInput) => {
    if (!currentProjectId) {
      return {
        success: false,
        error: '请先创建项目',
      };
    }
    
    const store = getMemoryCheckpointStore();
    const checkpoint = await store.load(currentProjectId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: '项目不存在',
      };
    }
    
    // 收集要细化的分镜
    const scenesToRefine = checkpoint.scenes.filter(s => sceneIds.includes(s.id));
    
    if (scenesToRefine.length === 0) {
      return {
        success: false,
        error: '未找到指定的分镜',
      };
    }
    
    // 更新状态
    checkpoint.workflowState = 'REFINING_SCENES';
    for (const id of sceneIds) {
      const idx = checkpoint.scenes.findIndex(s => s.id === id);
      if (idx !== -1) {
        checkpoint.scenes[idx].status = 'in_progress';
      }
    }
    await store.save(checkpoint);
    
    // 批量调用 AI 细化
    const result = await batchRefineWithAI(
      scenesToRefine.map(s => ({ sceneId: s.id, sceneSummary: s.summary })),
      {
        artStyle: checkpoint.artStyle,
        protagonist: checkpoint.protagonist,
        projectTitle: checkpoint.title,
      }
    );
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'AI 批量细化失败',
      };
    }
    
    // 更新分镜数据
    for (const refined of result.data.results) {
      const idx = checkpoint.scenes.findIndex(s => s.id === refined.sceneId);
      if (idx !== -1) {
        checkpoint.scenes[idx] = {
          ...checkpoint.scenes[idx],
          sceneDescription: refined.sceneDescription,
          keyframePrompt: refined.keyframePrompt,
          spatialPrompt: refined.spatialPrompt,
          status: 'completed',
        };
      }
    }
    
    // 检查是否所有分镜都完成
    const allCompleted = checkpoint.scenes.every(s => s.status === 'completed');
    if (allCompleted) {
      checkpoint.workflowState = 'ALL_SCENES_COMPLETE';
    }
    
    await store.save(checkpoint);

    return {
      success: true,
      data: { results: result.data.results },
      message: `已批量细化 ${result.data.results.length} 个分镜`,
    };
  },
});

/**
 * 导出提示词工具
 */
export const exportPromptsTool = tool({
  description: '导出所有分镜的提示词',
  inputSchema: exportPromptsInputSchema,
  execute: async ({ format, includeMetadata }: ExportPromptsInput) => {
    if (!currentProjectId) {
      return {
        success: false,
        error: '请先创建项目',
      };
    }
    
    const store = getMemoryCheckpointStore();
    const checkpoint = await store.load(currentProjectId);
    
    if (!checkpoint) {
      return {
        success: false,
        error: '项目不存在',
      };
    }
    
    // 检查是否有已完成的分镜
    const completedScenes = checkpoint.scenes.filter(s => s.status === 'completed');
    if (completedScenes.length === 0) {
      return {
        success: false,
        error: '没有已完成的分镜可导出',
      };
    }
    
    // 更新状态
    checkpoint.workflowState = 'EXPORTING';
    await store.save(checkpoint);
    
    // 构建导出数据
    const exportData: ExportData = {
      projectTitle: checkpoint.title,
      artStyle: checkpoint.artStyle,
      scenes: checkpoint.scenes.map(s => ({
        order: s.order,
        summary: s.summary,
        sceneDescription: s.sceneDescription,
        keyframePrompt: s.keyframePrompt,
        spatialPrompt: s.spatialPrompt,
        fullPrompt: s.keyframePrompt ? `${checkpoint.artStyle}, ${s.keyframePrompt}` : undefined,
      })),
      exportedAt: new Date().toISOString(),
    };
    
    // 格式化导出内容
    const content = formatExportData(exportData, format);
    
    // 更新状态为已导出
    checkpoint.workflowState = 'EXPORTED';
    await store.save(checkpoint);
    
    return {
      success: true,
      data: {
        format,
        includeMetadata,
        content,
        scenesCount: completedScenes.length,
        downloadUrl: null, // 在实际应用中可以生成下载链接
      },
      message: `提示词已导出为 ${format} 格式，共 ${completedScenes.length} 个分镜`,
    };
  },
});

/**
 * 所有可用工具
 */
export const agentTools = {
  create_project: createProjectTool,
  get_project_state: getProjectStateTool,
  set_project_info: setProjectInfoTool,
  generate_scenes: generateScenesTool,
  refine_scene: refineSceneTool,
  batch_refine_scenes: batchRefineScenesTool,
  export_prompts: exportPromptsTool,
};

export type AgentToolName = keyof typeof agentTools;
