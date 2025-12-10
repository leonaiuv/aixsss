import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToolCallSync, ToolCallResult } from './useToolCallSync';
import { useCanvasStore } from '@/stores/canvasStore';

// Mock canvasStore
vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: vi.fn(),
}));

describe('useToolCallSync', () => {
  const mockSetBlocks = vi.fn();
  const mockAddBlock = vi.fn();
  const mockUpdateBlock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useCanvasStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setBlocks: mockSetBlocks,
      addBlock: mockAddBlock,
      updateBlock: mockUpdateBlock,
      blocks: [],
    });
  });

  describe('handleToolResult', () => {
    it('应该处理 createProject 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      // tool 直接返回数据对象
      const toolResult: ToolCallResult = {
        toolName: 'createProject',
        result: {
          projectId: 'project-123',
          title: '测试项目',
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockAddBlock).toHaveBeenCalled();
    });

    it('应该处理 generateScenes 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      // tool 直接返回 { scenes: [...] }
      const toolResult: ToolCallResult = {
        toolName: 'generateScenes',
        result: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
            { id: 'scene-2', order: 2, summary: '分镜2', status: 'pending' },
          ],
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockSetBlocks).toHaveBeenCalled();
    });

    it('应该处理 refineScene 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      // tool 直接返回细化数据
      const toolResult: ToolCallResult = {
        toolName: 'refineScene',
        result: {
          sceneId: 'scene-1',
          sceneDescription: '细化后的描述',
          keyframePrompt: '关键帧提示词',
          status: 'completed',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockUpdateBlock).toHaveBeenCalled();
    });

    it('应该处理空结果的工具调用', () => {
      const { result } = renderHook(() => useToolCallSync());

      const toolResult: ToolCallResult = {
        toolName: 'createProject',
        result: {},
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      // 空结果时不应该添加块
      expect(mockAddBlock).not.toHaveBeenCalled();
    });

    it('应该支持 snake_case 工具名', () => {
      const { result } = renderHook(() => useToolCallSync());

      // 使用 snake_case 格式的 toolName
      const toolResult: ToolCallResult = {
        toolName: 'generate_scenes',
        result: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
          ],
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockSetBlocks).toHaveBeenCalled();
    });
  });

  describe('convertScenesToBlocks', () => {
    it('应该将分镜转换为画布块', () => {
      const { result } = renderHook(() => useToolCallSync());

      const scenes = [
        { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' as const },
        { id: 'scene-2', order: 2, summary: '分镜2', status: 'completed' as const },
      ];

      const blocks = result.current.convertScenesToBlocks(scenes);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].id).toBe('scene-1');
      expect(blocks[0].type).toBe('scene');
    });
  });
});
