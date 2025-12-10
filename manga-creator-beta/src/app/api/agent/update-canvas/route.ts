import { NextRequest, NextResponse } from 'next/server';
import { getCheckpointStore, type ProjectCheckpoint, type Scene } from '@/lib/checkpoint/store';
import type { SceneStatus } from '@/types';

/**
 * 画布块数据结构
 */
interface CanvasBlockData {
  id: string;
  type: 'project' | 'scene' | 'export' | string;
  content: Record<string, unknown>;
}

/**
 * 请求体结构
 */
interface UpdateCanvasRequest {
  projectId: string;
  blocks: CanvasBlockData[];
}

/**
 * POST /api/agent/update-canvas
 * 
 * 接收画布变化，更新 Checkpoint 存储
 * 实现 Canvas → Agent 同步
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as UpdateCanvasRequest;
    const { projectId, blocks } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: '缺少 projectId' },
        { status: 400 }
      );
    }

    if (!blocks || !Array.isArray(blocks)) {
      return NextResponse.json(
        { success: false, error: '缺少 blocks 数据' },
        { status: 400 }
      );
    }

    // 获取检查点存储
    const store = await getCheckpointStore();
    
    // 加载现有检查点
    const checkpoint = await store.load(projectId);
    if (!checkpoint) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 解析画布块，更新检查点数据
    const updatedCheckpoint = applyCanvasChanges(checkpoint, blocks);
    
    // 保存更新后的检查点
    await store.save(updatedCheckpoint);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        updatedAt: updatedCheckpoint.updatedAt,
      },
      message: '画布数据已同步到 Agent 状态',
    });
  } catch (error) {
    console.error('[update-canvas] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '同步失败' },
      { status: 500 }
    );
  }
}

/**
 * 将画布块变化应用到检查点
 */
function applyCanvasChanges(
  checkpoint: ProjectCheckpoint,
  blocks: CanvasBlockData[]
): ProjectCheckpoint {
  // 分离项目块和分镜块
  const projectBlock = blocks.find((b) => b.type === 'project');
  const sceneBlocks = blocks.filter((b) => b.type === 'scene');

  // 更新项目基础信息（如果有项目块）
  if (projectBlock) {
    const content = projectBlock.content;
    if (content.title !== undefined) {
      checkpoint.title = String(content.title);
    }
    if (content.summary !== undefined) {
      checkpoint.summary = String(content.summary);
    }
    if (content.artStyle !== undefined) {
      checkpoint.artStyle = String(content.artStyle);
    }
    if (content.protagonist !== undefined) {
      checkpoint.protagonist = String(content.protagonist);
    }
  }

  // 更新分镜列表
  if (sceneBlocks.length > 0) {
    // 创建现有分镜的映射
    const existingScenesMap = new Map(
      checkpoint.scenes.map((s) => [s.id, s])
    );

    // 合并更新分镜
    checkpoint.scenes = sceneBlocks.map((block): Scene => {
      const existing = existingScenesMap.get(block.id);
      const content = block.content;

      return {
        id: block.id,
        order: (content.order as number) ?? existing?.order ?? 0,
        summary: (content.summary as string) ?? existing?.summary ?? '',
        status: (content.status as SceneStatus) ?? existing?.status ?? 'pending',
        sceneDescription: (content.sceneDescription as string) ?? existing?.sceneDescription,
        keyframePrompt: (content.keyframePrompt as string) ?? existing?.keyframePrompt,
        spatialPrompt: (content.spatialPrompt as string) ?? existing?.spatialPrompt,
        error: (content.error as string) ?? existing?.error,
      };
    });
  }

  // 更新时间戳
  checkpoint.updatedAt = new Date().toISOString();

  return checkpoint;
}
