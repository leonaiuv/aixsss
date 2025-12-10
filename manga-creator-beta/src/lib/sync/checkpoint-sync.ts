import type { ProjectCheckpoint, Scene } from '@/lib/checkpoint/store';
import { getCheckpointStore } from '@/lib/checkpoint/store';
import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore, CanvasBlock } from '@/stores/canvasStore';
import type { ProjectState } from '@/types';

/**
 * 同步状态结果
 */
export interface SyncResult {
  success: boolean;
  projectId?: string;
  error?: string;
}

/**
 * 将 Checkpoint 转换为 ProjectState
 */
export function checkpointToProjectState(checkpoint: ProjectCheckpoint): ProjectState {
  return {
    projectId: checkpoint.projectId,
    workflowState: checkpoint.workflowState,
    title: checkpoint.title,
    summary: checkpoint.summary,
    artStyle: checkpoint.artStyle,
    protagonist: checkpoint.protagonist,
    scenes: checkpoint.scenes.map((scene) => ({
      id: scene.id,
      order: scene.order,
      summary: scene.summary,
      status: scene.status,
      sceneDescription: scene.sceneDescription,
      keyframePrompt: scene.keyframePrompt,
      spatialPrompt: scene.spatialPrompt,
      dialogues: [], // Checkpoint 中不存储对话，默认为空
    })),
    currentSceneIndex: 0,
    canvasContent: [],
    characters: [],
    createdAt: new Date(checkpoint.createdAt),
    updatedAt: new Date(checkpoint.updatedAt),
  };
}

/**
 * 将 Checkpoint 中的分镜转换为画布块
 */
export function scenesToCanvasBlocks(scenes: Scene[], artStyle: string): CanvasBlock[] {
  return scenes.map((scene) => ({
    id: scene.id,
    type: 'scene',
    content: {
      sceneId: scene.id,
      order: scene.order,
      summary: scene.summary,
      status: scene.status,
      sceneDescription: scene.sceneDescription,
      keyframePrompt: scene.keyframePrompt,
      spatialPrompt: scene.spatialPrompt,
      // 完整提示词 = 画风 + 关键帧提示词
      fullPrompt: scene.keyframePrompt && artStyle
        ? `${artStyle}, ${scene.keyframePrompt}`
        : scene.keyframePrompt || '',
    },
  }));
}

/**
 * 将 Checkpoint 中的项目信息转换为画布块
 */
export function projectInfoToCanvasBlock(checkpoint: ProjectCheckpoint): CanvasBlock {
  return {
    id: `basicInfo-${checkpoint.projectId}`,
    type: 'basicInfo',
    content: {
      title: checkpoint.title,
      summary: checkpoint.summary,
      artStyle: checkpoint.artStyle,
      protagonist: checkpoint.protagonist,
    },
  };
}

/**
 * 同步 Checkpoint 到 UI Stores
 * 
 * 将 Checkpoint 数据同步到 projectStore 和 canvasStore
 */
export async function syncCheckpointToStores(projectId: string): Promise<SyncResult> {
  try {
    const store = await getCheckpointStore();
    const checkpoint = await store.load(projectId);

    if (!checkpoint) {
      return { success: false, error: `Project ${projectId} not found` };
    }

    // 同步到 projectStore
    const projectState = checkpointToProjectState(checkpoint);
    useProjectStore.getState().syncFromAgent(projectState);

    // 同步到 canvasStore
    const basicInfoBlock = projectInfoToCanvasBlock(checkpoint);
    const sceneBlocks = scenesToCanvasBlocks(checkpoint.scenes, checkpoint.artStyle);
    useCanvasStore.getState().setBlocks([basicInfoBlock, ...sceneBlocks]);
    useCanvasStore.getState().markSynced();

    return { success: true, projectId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * 从 Checkpoint 加载项目并同步到 UI
 * 
 * @param projectId 项目 ID
 * @param threadId 线程 ID（用于设置当前线程）
 */
export async function loadProjectAndSync(
  projectId: string,
  threadId?: string
): Promise<SyncResult> {
  const projectStore = useProjectStore.getState();

  // 设置加载状态
  projectStore.setLoading(true);
  projectStore.setError(null);

  try {
    // 如果提供了 threadId，设置当前线程
    if (threadId) {
      projectStore.setCurrentThread(threadId);
    }

    // 同步 Checkpoint 到 Stores
    const result = await syncCheckpointToStores(projectId);

    if (!result.success) {
      projectStore.setError(result.error || 'Failed to load project');
    }

    return result;
  } finally {
    projectStore.setLoading(false);
  }
}

/**
 * 订阅 Checkpoint 变化并自动同步
 * 
 * 返回取消订阅函数
 */
export function subscribeToCheckpointChanges(
  projectId: string,
  onSync?: (result: SyncResult) => void
): () => void {
  let isActive = true;
  let lastUpdatedAt: string | null = null;

  const pollInterval = setInterval(async () => {
    if (!isActive) return;

    try {
      const store = await getCheckpointStore();
      const checkpoint = await store.load(projectId);

      if (checkpoint && checkpoint.updatedAt !== lastUpdatedAt) {
        lastUpdatedAt = checkpoint.updatedAt;
        const result = await syncCheckpointToStores(projectId);
        onSync?.(result);
      }
    } catch (error) {
      console.error('Checkpoint sync error:', error);
    }
  }, 1000); // 每秒轮询一次

  return () => {
    isActive = false;
    clearInterval(pollInterval);
  };
}
