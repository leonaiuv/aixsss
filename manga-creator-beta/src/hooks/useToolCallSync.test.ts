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
    it('应该处理 create_project 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      const toolResult: ToolCallResult = {
        toolName: 'create_project',
        result: {
          success: true,
          data: {
            projectId: 'project-123',
            title: '测试项目',
            createdAt: '2024-01-01T00:00:00Z',
          },
          message: '项目创建成功',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockAddBlock).toHaveBeenCalled();
    });

    it('应该处理 generate_scenes 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      const toolResult: ToolCallResult = {
        toolName: 'generate_scenes',
        result: {
          success: true,
          data: {
            scenes: [
              { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
              { id: 'scene-2', order: 2, summary: '分镜2', status: 'pending' },
            ],
          },
          message: '生成了2个分镜',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockSetBlocks).toHaveBeenCalled();
    });

    it('应该处理 refine_scene 工具调用结果', () => {
      const { result } = renderHook(() => useToolCallSync());

      const toolResult: ToolCallResult = {
        toolName: 'refine_scene',
        result: {
          success: true,
          data: {
            sceneId: 'scene-1',
            sceneDescription: '细化后的描述',
            keyframePrompt: '关键帧提示词',
            status: 'completed',
          },
          message: '分镜细化完成',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      expect(mockUpdateBlock).toHaveBeenCalled();
    });

    it('应该处理失败的工具调用', () => {
      const { result } = renderHook(() => useToolCallSync());

      const toolResult: ToolCallResult = {
        toolName: 'create_project',
        result: {
          success: false,
          error: '创建失败',
          message: '无法创建项目',
        },
      };

      act(() => {
        result.current.handleToolResult(toolResult);
      });

      // 失败时不应该添加块
      expect(mockAddBlock).not.toHaveBeenCalled();
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
