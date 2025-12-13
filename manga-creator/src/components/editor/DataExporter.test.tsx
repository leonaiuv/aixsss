import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataExporter } from './DataExporter';
import * as storage from '@/lib/storage';
import type { Project, Scene, Character } from '@/types';

// Mock storage module
vi.mock('@/lib/storage', () => ({
  getScenes: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock URL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
(globalThis as any).URL.createObjectURL = mockCreateObjectURL;
(globalThis as any).URL.revokeObjectURL = mockRevokeObjectURL;

// Mock localStorage for characters
const mockLocalStorage: Record<string, string> = {};

// 创建测试项目数据
function createMockProjects(count: number): Project[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `project-${i + 1}`,
    title: `测试项目 ${i + 1}`,
    summary: `这是测试项目 ${i + 1} 的剧情简介`,
    style: 'anime',
    artStyleConfig: {
      presetId: 'anime_cel',
      baseStyle: 'anime style, cel shaded',
      technique: 'flat color blocking',
      colorPalette: 'vibrant colors',
      culturalFeature: 'Japanese animation',
      fullPrompt: 'anime style prompt',
    },
    protagonist: `主角 ${i + 1}`,
    workflowState: 'ALL_SCENES_COMPLETE' as const,
    currentSceneOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

// 创建测试分镜数据
function createMockScenes(projectId: string, count: number): Scene[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${projectId}-${i + 1}`,
    projectId,
    order: i + 1,
    summary: `分镜 ${i + 1} 概要`,
    sceneDescription: `分镜 ${i + 1} 场景锚点`,
    actionDescription: `分镜 ${i + 1} 动作描述`,
    shotPrompt: `keyframe prompt for scene ${i + 1}`,
    motionPrompt: `motion prompt for scene ${i + 1}`,
    dialogues: i === 0 ? [{ id: 'd1', type: 'dialogue' as const, content: '测试台词', characterName: '角色A', order: 0 }] : [],
    status: 'completed' as const,
    notes: `备注 ${i + 1}`,
  }));
}

// 创建测试角色数据
function createMockCharacters(projectId: string, count: number): Character[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `char-${projectId}-${i + 1}`,
    projectId,
    name: `角色 ${i + 1}`,
    briefDescription: `角色 ${i + 1} 简介`,
    appearance: `角色 ${i + 1} 外貌`,
    personality: `角色 ${i + 1} 性格`,
    background: `角色 ${i + 1} 背景`,
    portraitPrompts: {
      midjourney: `mj prompt ${i + 1}`,
      stableDiffusion: `sd prompt ${i + 1}`,
      general: `general prompt ${i + 1}`,
    },
    relationships: [],
    appearances: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

describe('DataExporter', () => {
  const mockOnImport = vi.fn();

  // 创建所有项目的分镜和角色数据映射
  const mockScenesByProject: Record<string, Scene[]> = {
    'project-1': createMockScenes('project-1', 3),
    'project-2': createMockScenes('project-2', 2),
    'project-3': createMockScenes('project-3', 5),
  };

  const mockCharactersByProject: Record<string, Character[]> = {
    'project-1': createMockCharacters('project-1', 2),
    'project-2': createMockCharacters('project-2', 1),
    'project-3': createMockCharacters('project-3', 3),
  };

  const defaultProps = {
    projects: createMockProjects(3),
    onImport: mockOnImport,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getScenes from storage
    vi.mocked(storage.getScenes).mockImplementation((projectId: string) => {
      return mockScenesByProject[projectId] || [];
    });

    // Mock localStorage for characters
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
    Object.entries(mockCharactersByProject).forEach(([projectId, chars]) => {
      mockLocalStorage[`aixs_characters_${projectId}`] = JSON.stringify(chars);
    });

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return mockLocalStorage[key] || null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始渲染', () => {
    it('应该正确渲染导出组件标题和描述', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('数据导出')).toBeInTheDocument();
      expect(screen.getByText('导出项目数据为多种格式')).toBeInTheDocument();
    });

    it('应该显示导入区域', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('数据导入')).toBeInTheDocument();
      expect(screen.getByText('从JSON文件导入项目数据')).toBeInTheDocument();
    });

    it('应该显示所有项目列表', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('测试项目 1')).toBeInTheDocument();
      expect(screen.getByText('测试项目 2')).toBeInTheDocument();
      expect(screen.getByText('测试项目 3')).toBeInTheDocument();
    });

    it('应该显示每个项目的分镜数量', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('3 个分镜')).toBeInTheDocument();
      expect(screen.getByText('2 个分镜')).toBeInTheDocument();
      expect(screen.getByText('5 个分镜')).toBeInTheDocument();
    });

    it('初始时应该没有项目被选中', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('选择项目 (0 / 3)')).toBeInTheDocument();
    });

    it('导出按钮初始时应该被禁用', () => {
      render(<DataExporter {...defaultProps} />);
      
      const exportButton = screen.getByRole('button', { name: /导出 \(0\)/ });
      expect(exportButton).toBeDisabled();
    });
  });

  describe('项目选择', () => {
    it('应该能够选择单个项目', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      const project1 = screen.getByText('测试项目 1').closest('div[class*="cursor-pointer"]');
      if (project1) await user.click(project1);
      
      expect(screen.getByText('选择项目 (1 / 3)')).toBeInTheDocument();
    });

    it('应该能够全选所有项目', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      const selectAllButton = screen.getByRole('button', { name: '全选' });
      await user.click(selectAllButton);
      
      expect(screen.getByText('选择项目 (3 / 3)')).toBeInTheDocument();
    });

    it('应该能够取消全选', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      // 先全选
      await user.click(screen.getByRole('button', { name: '全选' }));
      expect(screen.getByText('选择项目 (3 / 3)')).toBeInTheDocument();
      
      // 再取消
      await user.click(screen.getByRole('button', { name: '取消全选' }));
      expect(screen.getByText('选择项目 (0 / 3)')).toBeInTheDocument();
    });

    it('选择项目后导出按钮应该启用', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: '全选' }));
      
      const exportButton = screen.getByRole('button', { name: /导出 \(3\)/ });
      expect(exportButton).not.toBeDisabled();
    });
  });

  describe('导出格式选择', () => {
    it('默认格式应该是JSON', () => {
      render(<DataExporter {...defaultProps} />);
      
      // 检查下拉框的显示值
      expect(screen.getByText('JSON (推荐)')).toBeInTheDocument();
    });

    // 注：Radix UI Select在jsdom中有兼容性问题，跳过交互测试
  });

  describe('导出选项', () => {
    it('应该显示包含元数据选项', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('包含元数据')).toBeInTheDocument();
    });

    it('应该显示包含分镜数据选项', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('包含分镜数据')).toBeInTheDocument();
    });

    it('元数据选项默认应该勾选', () => {
      render(<DataExporter {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /包含元数据/ });
      expect(checkbox).toBeChecked();
    });

    it('分镜数据选项默认应该勾选', () => {
      render(<DataExporter {...defaultProps} />);
      
      const checkbox = screen.getByRole('checkbox', { name: /包含分镜数据/ });
      expect(checkbox).toBeChecked();
    });

    it('应该显示包含角色数据选项', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('包含角色数据')).toBeInTheDocument();
    });
  });

  describe('JSON导出功能', () => {
    it('应该正确导出JSON格式数据', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      // 选择项目
      await user.click(screen.getByRole('button', { name: '全选' }));
      
      // 点击导出
      const exportButton = screen.getByRole('button', { name: /导出 \(3\)/ });
      await user.click(exportButton);
      
      // 验证Blob创建
      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('导入功能', () => {
    it('应该显示导入按钮', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('选择文件')).toBeInTheDocument();
    });

    it('应该显示导入注意事项', () => {
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByText('注意事项')).toBeInTheDocument();
      expect(screen.getByText(/导入会覆盖同ID的项目数据/)).toBeInTheDocument();
    });

    it('应该只接受JSON文件', () => {
      render(<DataExporter {...defaultProps} />);
      
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept', '.json');
    });
  });

  describe('边界条件', () => {
    it('应该正确处理空项目列表', () => {
      render(<DataExporter projects={[]} onImport={mockOnImport} />);
      
      expect(screen.getByText('数据导出')).toBeInTheDocument();
      expect(screen.getByText('选择项目 (0 / 0)')).toBeInTheDocument();
    });

    it('应该正确处理没有分镜的项目', () => {
      vi.mocked(storage.getScenes).mockReturnValue([]);
      
      render(<DataExporter {...defaultProps} />);

      // 每个项目显示0个分镜
      const zeroSceneElements = screen.getAllByText('0 个分镜');
      expect(zeroSceneElements.length).toBe(3);
    });

    it('应该正确处理单个项目', () => {
      render(<DataExporter projects={createMockProjects(1)} onImport={mockOnImport} />);
      
      expect(screen.getByText('选择项目 (0 / 1)')).toBeInTheDocument();
    });
  });

  describe('导出进度', () => {
    it('导出后toast应该被调用', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: '全选' }));
      
      // 点击导出按钮 - 使用更精确的选择器
      const exportButton = screen.getByRole('button', { name: /导出 \(3\)/ });
      await user.click(exportButton);
      
      // 等待导出完成（toast被调用）
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('UI交互', () => {
    it('点击项目行应该切换选中状态', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      const project1 = screen.getByText('测试项目 1').closest('div[class*="cursor-pointer"]');
      
      // 第一次点击选中
      if (project1) {
        await user.click(project1);
        expect(screen.getByText('选择项目 (1 / 3)')).toBeInTheDocument();
        
        // 第二次点击取消
        await user.click(project1);
        expect(screen.getByText('选择项目 (0 / 3)')).toBeInTheDocument();
      }
    });

    it('全选/取消全选按钮文本应该正确切换', async () => {
      const user = userEvent.setup();
      render(<DataExporter {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: '全选' })).toBeInTheDocument();
      
      await user.click(screen.getByRole('button', { name: '全选' }));
      
      expect(screen.getByRole('button', { name: '取消全选' })).toBeInTheDocument();
    });
  });
});
