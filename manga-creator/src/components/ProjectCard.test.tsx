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
        />
      );

      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    it('应正确渲染项目风格', () => {
      render(
        <ProjectCard
          project={createTestProject({ style: 'watercolor' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('watercolor')).toBeInTheDocument();
    });

    it('当风格为空时应显示默认文本', () => {
      render(
        <ProjectCard
          project={createTestProject({ style: '' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('未设置风格')).toBeInTheDocument();
    });

    it('应显示创建日期', () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });
  });

  describe('进度显示', () => {
    const progressTestCases: Array<{ state: WorkflowState; expectedProgress: number }> = [
      { state: 'IDLE', expectedProgress: 10 },
      { state: 'DATA_COLLECTING', expectedProgress: 10 },
      { state: 'DATA_COLLECTED', expectedProgress: 25 },
      { state: 'SCENE_LIST_GENERATING', expectedProgress: 40 },
      { state: 'SCENE_LIST_EDITING', expectedProgress: 40 },
      { state: 'SCENE_LIST_CONFIRMED', expectedProgress: 50 },
      { state: 'SCENE_PROCESSING', expectedProgress: 75 },
      { state: 'ALL_SCENES_COMPLETE', expectedProgress: 90 },
      { state: 'EXPORTING', expectedProgress: 100 },
    ];

    progressTestCases.forEach(({ state, expectedProgress }) => {
      it(`工作流状态 ${state} 应显示 ${expectedProgress}% 进度`, () => {
        render(
          <ProjectCard
            project={createTestProject({ workflowState: state })}
            onOpen={mockOnOpen}
            onDelete={mockOnDelete}
          />
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
        />
      );

      const title = screen.getByText('Test Project');
      await userEvent.click(title);

      expect(mockOnOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_test' }));
    });

    it('点击删除菜单项应调用 onDelete', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      // 打开下拉菜单
      const menuButton = screen.getByRole('button');
      await userEvent.click(menuButton);

      // 点击删除选项
      const deleteOption = await screen.findByText('删除项目');
      await userEvent.click(deleteOption);

      expect(mockOnDelete).toHaveBeenCalledWith('proj_test');
    });

    it('点击打开菜单项应调用 onOpen', async () => {
      render(
        <ProjectCard
          project={createTestProject()}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      // 打开下拉菜单
      const menuButton = screen.getByRole('button');
      await userEvent.click(menuButton);

      // 点击打开选项
      const openOption = await screen.findByText('打开项目');
      await userEvent.click(openOption);

      expect(mockOnOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_test' }));
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
        />
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
        />
      );

      expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    });

    it('应处理中文标题', () => {
      render(
        <ProjectCard
          project={createTestProject({ title: '中文项目标题' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('中文项目标题')).toBeInTheDocument();
    });

    it('应处理 emoji 标题', () => {
      render(
        <ProjectCard
          project={createTestProject({ title: '🎨 Art Project 🖌️' })}
          onOpen={mockOnOpen}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('🎨 Art Project 🖌️')).toBeInTheDocument();
    });
  });
});
