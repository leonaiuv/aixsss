import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore, CanvasBlock } from '@/stores/canvasStore';
import type { ProjectState, Scene } from '@/types';

/**
 * Sync Result Interface
 */
export interface SyncResult {
  success: boolean;
  projectId?: string;
  error?: string;
}

/**
 * Fetch Project State from API
 */
async function fetchProjectState(projectId: string): Promise<ProjectState | null> {
  try {
    const res = await fetch(`/api/agent/state?threadId=${projectId}`);
    if (!res.ok) {
      console.error(`Failed to fetch state: ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    return data.project as ProjectState;
  } catch (e) {
    console.error('Fetch error:', e);
    return null;
  }
}

/**
 * Convert Scenes to Canvas Blocks
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
      fullPrompt: scene.keyframePrompt && artStyle
        ? `${artStyle}, ${scene.keyframePrompt}`
        : scene.keyframePrompt || '',
    },
  }));
}

/**
 * Convert Project Info to Canvas Block
 */
export function projectInfoToCanvasBlock(project: ProjectState): CanvasBlock {
  return {
    id: `basicInfo-${project.projectId || 'new'}`,
    type: 'basicInfo',
    content: {
      title: project.title,
      summary: project.summary,
      artStyle: project.artStyle,
      protagonist: project.protagonist,
    },
  };
}

/**
 * Sync Agent State to UI Stores
 */
export async function syncCheckpointToStores(projectId: string): Promise<SyncResult> {
  try {
    const projectState = await fetchProjectState(projectId);

    if (!projectState) {
      return { success: false, error: `Project ${projectId} not found` };
    }

    // Sync to projectStore
    useProjectStore.getState().syncFromAgent(projectState);

    // Sync to canvasStore
    const basicInfoBlock = projectInfoToCanvasBlock(projectState);
    const sceneBlocks = scenesToCanvasBlocks(projectState.scenes || [], projectState.artStyle || '');
    useCanvasStore.getState().setBlocks([basicInfoBlock, ...sceneBlocks]);
    useCanvasStore.getState().markSynced();

    return { success: true, projectId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Load Project and Sync
 */
export async function loadProjectAndSync(
  projectId: string,
  threadId?: string
): Promise<SyncResult> {
  const projectStore = useProjectStore.getState();

  projectStore.setLoading(true);
  projectStore.setError(null);

  try {
    if (threadId) {
      projectStore.setCurrentThread(threadId);
    }

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
 * Subscribe to Checkpoint Changes
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
      const projectState = await fetchProjectState(projectId);
      
      if (projectState) {
        // Simple change detection based on updatedAt
        // Assuming updatedAt is an ISO string or Date object
        const currentUpdatedAt = new Date(projectState.updatedAt).toISOString();
        
        if (currentUpdatedAt !== lastUpdatedAt) {
          lastUpdatedAt = currentUpdatedAt;
          const result = await syncCheckpointToStores(projectId);
          onSync?.(result);
        }
      }
    } catch (error) {
      console.error('Checkpoint sync error:', error);
    }
  }, 2000); // Poll every 2 seconds

  return () => {
    isActive = false;
    clearInterval(pollInterval);
  };
}
