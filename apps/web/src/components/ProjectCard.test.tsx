import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectCard } from '@/components/ProjectCard';
import { Project, WorkflowState } from '@/types';

// ==========================================
// ProjectCard 组件测试
// ==========================================

describe('ProjectCard', () => {
  const createTestProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'proj_test',
    title: 'Test Project',
    summary: 'Test summary',
    style: 'ink',
    protagonist: 'hero',
    workflowState: 'DATA_COLLECTING',
    currentSceneOrder: 0,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  });

  const mockOnOpen = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnRename = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('应正确渲染项目标题', () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    it('应正确渲染项目风格', () => {
      render(
        <ProjectCard
          project={createTestProject({ style: 'watercolor' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText('watercolor')).toBeInTheDocument();
    });

    it('当风格为空时不应显示风格标签', () => {
      render(
        <ProjectCard
          project={createTestProject({ style: '' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 新版 UI 中，当风格为空时不显示风格 Badge
      expect(screen.queryByText('未设置风格')).not.toBeInTheDocument();
    });

    it('应显示创建日期', () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });
  });

  describe('进度显示', () => {
    // 注意：无 _stats 时，进度为状态范围的中间值
    const progressTestCases: Array<{ state: WorkflowState; expectedProgress: number }> = [
      { state: 'IDLE', expectedProgress: 3 }, // (0+5)/2 = 2.5 → 3
      { state: 'DATA_COLLECTING', expectedProgress: 8 }, // (5+10)/2 = 7.5 → 8
      { state: 'DATA_COLLECTED', expectedProgress: 13 }, // (10+15)/2 = 12.5 → 13
      { state: 'WORLD_VIEW_BUILDING', expectedProgress: 18 }, // (15+20)/2 = 17.5 → 18
      { state: 'CHARACTER_MANAGING', expectedProgress: 23 }, // (20+25)/2 = 22.5 → 23
      { state: 'EPISODE_PLANNING', expectedProgress: 30 }, // (25+35)/2 = 30
      { state: 'EPISODE_PLAN_EDITING', expectedProgress: 40 }, // (35+45)/2 = 40
      { state: 'EPISODE_CREATING', expectedProgress: 53 }, // (45+60)/2 = 52.5 → 53
      { state: 'SCENE_LIST_GENERATING', expectedProgress: 63 }, // (60+65)/2 = 62.5 → 63
      { state: 'SCENE_LIST_EDITING', expectedProgress: 70 }, // (65+75)/2 = 70
      { state: 'SCENE_LIST_CONFIRMED', expectedProgress: 78 }, // (75+80)/2 = 77.5 → 78
      { state: 'SCENE_PROCESSING', expectedProgress: 88 }, // (80+95)/2 = 87.5 → 88
      { state: 'ALL_SCENES_COMPLETE', expectedProgress: 97 }, // (95+98)/2 = 96.5 → 97
      { state: 'ALL_EPISODES_COMPLETE', expectedProgress: 97 }, // (95+98)/2 = 96.5 → 97
      { state: 'EXPORTING', expectedProgress: 99 }, // (98+100)/2 = 99
    ];

    progressTestCases.forEach(({ state, expectedProgress }) => {
      it(`工作流状态 ${state} 应显示 ${expectedProgress}% 进度`, () => {
        render(
          <ProjectCard
            project={createTestProject({ workflowState: state })}
            onOpen={mockOnOpen}
            onDelete={mockOnDelete}
            onRename={mockOnRename}
          />,
        );

        expect(screen.getByText(`${expectedProgress}%`)).toBeInTheDocument();
      });
    });
  });

  describe('交互', () => {
    it('点击卡片应调用 onOpen', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      const title = screen.getByText('Test Project');
      await userEvent.click(title);

      expect(mockOnOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_test' }));
    });

    it('点击重命名菜单项应调用 onRename', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 找到并点击下拉菜单按钮
      const menuButton = screen.getByTestId('more-icon').closest('button');
      await userEvent.click(menuButton!);

      // 点击重命名选项
      const renameOption = await screen.findByText('重命名');
      await userEvent.click(renameOption);

      expect(mockOnRename).toHaveBeenCalledWith('proj_test', 'Test Project');
    });

    it('点击删除菜单项应调用 onDelete', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 找到并点击下拉菜单按钮
      const menuButton = screen.getByTestId('more-icon').closest('button');
      await userEvent.click(menuButton!);

      // 点击删除选项
      const deleteOption = await screen.findByText('删除');
      await userEvent.click(deleteOption);

      expect(mockOnDelete).toHaveBeenCalledWith('proj_test');
    });

    it('下拉菜单不应包含打开项目选项', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 找到并点击下拉菜单按钮
      const menuButton = screen.getByTestId('more-icon').closest('button');
      await userEvent.click(menuButton!);

      // 确保没有"打开项目"选项
      expect(screen.queryByText('打开项目')).not.toBeInTheDocument();
      expect(screen.getByText('重命名')).toBeInTheDocument();
      expect(screen.getByText('删除')).toBeInTheDocument();
    });

    it('点击下拉菜单按钮不应触发 onOpen', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 找到并点击下拉菜单按钮
      const menuButton = screen.getByTestId('more-icon').closest('button');
      await userEvent.click(menuButton!);

      // 确保 onOpen 没有被调用
      expect(mockOnOpen).not.toHaveBeenCalled();
    });
  });

  describe('边界情况', () => {
    it('应处理超长标题', () => {
      const longTitle = 'a'.repeat(200);
      render(
        <ProjectCard
          project={createTestProject({ title: longTitle })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 标题应该被截断或正常渲染
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('应处理特殊字符标题', () => {
      render(
        <ProjectCard
          project={createTestProject({ title: '<script>alert("xss")</script>' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    });

    it('应处理中文标题', () => {
      render(
        <ProjectCard
          project={createTestProject({ title: '中文项目标题' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText('中文项目标题')).toBeInTheDocument();
    });

    it('应处理 emoji 标题', () => {
      render(
        <ProjectCard
          project={createTestProject({ title: '🎨 Art Project 🖌️' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      expect(screen.getByText('🎨 Art Project 🖌️')).toBeInTheDocument();
    });

    it('重命名功能应传递正确的当前标题', async () => {
      const testTitle = '特殊标题 !@#$%^&*()';
      render(
        <ProjectCard
          project={createTestProject({ title: testTitle })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
          onRename={mockOnRename}
        />,
      );

      // 找到并点击下拉菜单按钮
      const menuButton = screen.getByTestId('more-icon').closest('button');
      await userEvent.click(menuButton!);

      // 点击重命名选项
      const renameOption = await screen.findByText('重命名');
      await userEvent.click(renameOption);

      expect(mockOnRename).toHaveBeenCalledWith('proj_test', testTitle);
    });
  });
});
