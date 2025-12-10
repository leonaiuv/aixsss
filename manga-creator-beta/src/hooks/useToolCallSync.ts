import { useCallback } from 'react';
import { useCanvasStore, CanvasBlock } from '@/stores/canvasStore';

/**
 * 工具名称类型
 */
type ToolName = 'createProject' | 'setProjectInfo' | 'generateScenes' | 'refineScene' | 'batchRefineScenes' | 'exportPrompts' | string;

/**
 * 工具调用结果的数据结构
 * 
 * 注意：tool 直接返回数据对象，不是包装在 { success, data } 中
 */
export interface ToolCallResult {
  toolName: ToolName;
  result: Record<string, unknown>; // tool 直接返回的数据
}

/**
 * 分镜数据结构
 */
interface SceneData {
  id: string;
  order: number;
  summary: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  sceneDescription?: string;
  keyframePrompt?: string;
  spatialPrompt?: string;
}

/**
 * 工具调用同步 Hook
 * 
 * 将 Agent 工具调用的结果同步到画布 UI
 */
export function useToolCallSync() {
  const { setBlocks, addBlock, updateBlock, blocks } = useCanvasStore();

  /**
   * 将分镜数据转换为画布块
   */
  const convertScenesToBlocks = useCallback((scenes: SceneData[]): CanvasBlock[] => {
    return scenes.map((scene) => ({
      id: scene.id,
      type: 'scene' as const,
      content: {
        order: scene.order,
        summary: scene.summary,
        status: scene.status,
        sceneDescription: scene.sceneDescription,
        keyframePrompt: scene.keyframePrompt,
        spatialPrompt: scene.spatialPrompt,
      },
    }));
  }, []);

  /**
   * 处理工具调用结果
   * 
   * 注意：tool 直接返回数据对象，不是 { success, data } 结构
   */
  const handleToolResult = useCallback((toolResult: ToolCallResult) => {
    const { toolName, result: data } = toolResult;

    // 空结果不处理
    if (!data || Object.keys(data).length === 0) {
      console.warn(`Tool ${toolName} returned empty result`);
      return;
    }

    // toolName 可能是 camelCase 或 snake_case，统一处理
    const normalizedToolName = toolName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    switch (normalizedToolName) {
      case 'createProject': {
        // 创建项目 - 添加项目信息块
        addBlock({
          id: `project-${data.projectId}`,
          type: 'project',
          content: {
            projectId: data.projectId,
            title: data.title,
            createdAt: data.createdAt,
          },
        });
        break;
      }

      case 'setProjectInfo': {
        // 更新项目信息 - 找到并更新项目块
        const projectBlock = blocks.find((b) => b.type === 'project');
        if (projectBlock) {
          updateBlock(projectBlock.id, {
            content: {
              ...projectBlock.content,
              ...data,
            },
          });
        }
        break;
      }

      case 'generateScenes': {
        // 生成分镜 - 设置所有分镜块
        const scenes = data.scenes as SceneData[];
        if (scenes && Array.isArray(scenes)) {
          const sceneBlocks = convertScenesToBlocks(scenes);
          // 保留项目块，替换分镜块
          const projectBlocks = blocks.filter((b) => b.type === 'project');
          setBlocks([...projectBlocks, ...sceneBlocks]);
        }
        break;
      }

      case 'refineScene': {
        // 细化分镜 - 更新单个分镜块
        const sceneId = data.sceneId as string;
        if (sceneId) {
          updateBlock(sceneId, {
            content: {
              sceneDescription: data.sceneDescription,
              keyframePrompt: data.keyframePrompt,
              spatialPrompt: data.spatialPrompt,
              fullPrompt: data.fullPrompt,
              status: data.status ?? 'completed',
            },
          });
        }
        break;
      }

      case 'batchRefineScenes': {
        // 批量细化 - 更新多个分镜块
        const results = data.results as Array<{ sceneId: string; status: string }>;
        if (results && Array.isArray(results)) {
          results.forEach((r) => {
            updateBlock(r.sceneId, {
              content: { status: r.status },
            });
          });
        }
        break;
      }

      case 'exportPrompts': {
        // 导出提示词 - 添加导出结果块
        addBlock({
          id: `export-${Date.now()}`,
          type: 'export',
          content: {
            format: data.format,
            content: data.content,
          },
        });
        break;
      }

      default:
        console.log(`Unknown tool: ${toolName}`, data);
    }
  }, [blocks, addBlock, updateBlock, setBlocks, convertScenesToBlocks]);

  return {
    handleToolResult,
    convertScenesToBlocks,
  };
}
