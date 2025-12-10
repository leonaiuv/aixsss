import { NextRequest, NextResponse } from 'next/server';
import { graph } from '@/lib/agent/graph';
import type { SceneStatus, Scene } from '@/types';

/**
 * Canvas Block Data Structure
 */
interface CanvasBlockData {
  id: string;
  type: 'project' | 'scene' | 'export' | string;
  content: Record<string, unknown>;
}

/**
 * Request Body Structure
 */
interface UpdateCanvasRequest {
  projectId: string;
  blocks: CanvasBlockData[];
}

/**
 * POST /api/agent/update-canvas
 * 
 * Receives canvas changes and updates the LangGraph Agent State.
 * This ensures the canvas (BlockNote) is always in sync with the Agent's memory.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UpdateCanvasRequest;
    const { projectId, blocks } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Missing projectId' },
        { status: 400 }
      );
    }

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { success: false, error: 'Missing blocks data' },
        { status: 400 }
      );
    }

    // 1. Load current Agent State
    const config = { configurable: { thread_id: projectId } };
    const state = await graph.getState(config);
    
    // Get current project state (or default)
    const currentProject = state.values.project || {
      projectId,
      title: '',
      summary: '',
      artStyle: '',
      protagonist: '',
      workflowState: 'IDLE',
      scenes: [],
      currentSceneIndex: 0,
      canvasContent: [],
      characters: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 2. Extract changes from canvas blocks
    const changes = extractProjectChanges(currentProject, blocks);
    
    // 3. Update LangGraph State
    if (Object.keys(changes).length > 0) {
      await graph.updateState(config, {
        project: {
          ...changes,
          canvasContent: blocks, // Also save the raw blocks for restoration
          updatedAt: new Date(),
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        updatedAt: new Date().toISOString(),
      },
      message: 'Canvas synced to Agent State',
    });
  } catch (error) {
    console.error('[update-canvas] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

/**
 * Extract changes from canvas blocks to update project state
 */
function extractProjectChanges(
  currentProject: any,
  blocks: CanvasBlockData[]
): Record<string, any> {
  const changes: Record<string, any> = {};
  
  const projectBlock = blocks.find((b) => b.type === 'project');
  const sceneBlocks = blocks.filter((b) => b.type === 'scene');

  // 1. Update Basic Info
  if (projectBlock) {
    const content = projectBlock.content;
    if (content.title !== undefined) changes.title = String(content.title);
    if (content.summary !== undefined) changes.summary = String(content.summary);
    if (content.artStyle !== undefined) changes.artStyle = String(content.artStyle);
    if (content.protagonist !== undefined) changes.protagonist = String(content.protagonist);
  }

  // 2. Update Scenes
  // If we have scene blocks, we rebuild the scenes array.
  // Note: This assumes the canvas has the *full* list of scenes. 
  // If partial updates are sent, this logic needs to be more complex (merge).
  // BlockNote usually represents the full document.
  if (sceneBlocks.length > 0) {
    const existingScenesMap = new Map<string, Scene>(
      (currentProject.scenes || []).map((s: Scene) => [s.id, s])
    );

    const newScenes = sceneBlocks.map((block): Scene => {
      const existing = existingScenesMap.get(block.id);
      const content = block.content;

      // Merge existing data with block content
      // We prioritize block content for editable fields
      return {
        id: block.id,
        order: (content.order as number) ?? existing?.order ?? 0,
        summary: (content.summary as string) ?? existing?.summary ?? '',
        status: (content.status as SceneStatus) ?? existing?.status ?? 'pending',
        sceneDescription: (content.sceneDescription as string) ?? existing?.sceneDescription,
        keyframePrompt: (content.keyframePrompt as string) ?? existing?.keyframePrompt,
        spatialPrompt: (content.spatialPrompt as string) ?? existing?.spatialPrompt,
        dialogues: existing?.dialogues || [], // Preserve dialogues if not in block
      };
    });

    changes.scenes = newScenes;
  }

  return changes;
}
