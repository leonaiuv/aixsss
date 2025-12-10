import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectList } from '@/components/ProjectList';
import { useProjectStore } from '@/stores/projectStore';
import { useToast } from '@/hooks/use-toast';

// Mock the stores and hooks
vi.mock('@/stores/projectStore');
vi.mock('@/hooks/use-toast');
vi.mock('@/lib/storage', () => ({
  getProjects: () => [],
  saveProject: () => {},
  deleteProject: () => {},
  getProject: () => null,
}));

const mockUseProjectStore = vi.mocked(useProjectStore);
const mockUseToast = vi.mocked(useToast);

describe('ProjectList', () => {
  const mockProjects = [
    {
      id: 'proj_1',
      title: '测试项目1',
      summary: '摘要1',
      style: 'ink',
      protagonist: '主角1',
      workflowState: 'DATA_COLLECTING' as const,
      currentSceneOrder: 0,
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
    {
      id: 'proj_2',
      title: '测试项目2',
      summary: '摘要2',
      style: 'watercolor',
      protagonist: '主角2',
      workflowState: 'SCENE_PROCESSING' as const,
      currentSceneOrder: 1,
      createdAt: '2024-01-16T10:00:00.000Z',
      updatedAt: '2024-01-16T10:00:00.000Z',
    },
  ];

  const mockToast = {
    toast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);
    mockUseProjectStore.mockReturnValue({
      projects: mockProjects,
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProject: vi.fn(),
      setCurrentProject: vi.fn(),
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      currentProject: null,
      isLoading: false,
    } as any);
  });

  it('应该渲染项目列表', () => {
    render(<ProjectList onOpenEditor={vi.fn()} />);

    expect(screen.getByText('测试项目1')).toBeInTheDocument();
    expect(screen.getByText('测试项目2')).toBeInTheDocument();
    expect(screen.getByText('ink')).toBeInTheDocument();
    expect(screen.getByText('watercolor')).toBeInTheDocument();
  });

  it('应该显示正确的项目数量', () => {
    render(<ProjectList onOpenEditor={vi.fn()} />);

    expect(screen.getByText('我的项目')).toBeInTheDocument();
    // 项目卡片应该渲染
    expect(screen.getByText('测试项目1')).toBeInTheDocument();
    expect(screen.getByText('测试项目2')).toBeInTheDocument();
  });

  it('应该在没有项目时显示空状态', () => {
    mockUseProjectStore.mockReturnValue({
      projects: [],
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProject: vi.fn(),
      setCurrentProject: vi.fn(),
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      currentProject: null,
      isLoading: false,
    } as any);

    render(<ProjectList onOpenEditor={vi.fn()} />);

    expect(screen.getByText('还没有项目')).toBeInTheDocument();
    expect(screen.getByText('开始创建你的第一个漫剧项目吧')).toBeInTheDocument();
  });

  it('应该显示重命名菜单选项', async () => {
    render(<ProjectList onOpenEditor={vi.fn()} />);

    // 找到第一个项目的更多选项按钮
    const moreButtons = screen.getAllByTestId('more-icon');
    const firstMoreButton = moreButtons[0].closest('button');

    // 点击更多选项
    await userEvent.click(firstMoreButton!);

    // 验证菜单包含重命名和删除选项
    expect(screen.getByText('重命名')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
    // 确保没有"打开项目"选项
    expect(screen.queryByText('打开项目')).not.toBeInTheDocument();
  });

  it('应该调用重命名回调', async () => {
    const mockUpdateProject = vi.fn();
    mockUseProjectStore.mockReturnValue({
      ...mockUseProjectStore(),
      updateProject: mockUpdateProject,
    } as any);

    render(<ProjectList onOpenEditor={vi.fn()} />);

    // 找到第一个项目的更多选项按钮
    const moreButtons = screen.getAllByTestId('more-icon');
    await userEvent.click(moreButtons[0].closest('button')!);

    // 点击重命名选项
    const renameOption = screen.getByText('重命名');
    await userEvent.click(renameOption);

    // 重命名对话框应该打开
    expect(screen.getByText('重命名项目')).toBeInTheDocument();
  });

  it('应该调用删除回调', async () => {
    const mockDeleteProject = vi.fn();
    mockUseProjectStore.mockReturnValue({
      ...mockUseProjectStore(),
      deleteProject: mockDeleteProject,
    } as any);

    render(<ProjectList onOpenEditor={vi.fn()} />);

    // 找到第一个项目的更多选项按钮
    const moreButtons = screen.getAllByTestId('more-icon');
    await userEvent.click(moreButtons[0].closest('button')!);

    // 点击删除选项
    const deleteOption = screen.getByText('删除');
    await userEvent.click(deleteOption);

    // 删除确认对话框应该打开
    expect(screen.getByText('确认删除项目?')).toBeInTheDocument();
  });
});