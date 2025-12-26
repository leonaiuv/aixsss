import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
// Mock LocalDataMigrationBanner to avoid interference with empty state tests
vi.mock('./LocalDataMigrationBanner', () => ({
  LocalDataMigrationBanner: () => null,
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

  // Helper to create a store mock that handles both direct access and selector calls
  const createStoreMock = (overrides: Record<string, unknown> = {}) => {
    const state = {
      projects: mockProjects,
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProject: vi.fn(),
      setCurrentProject: vi.fn(),
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      currentProject: null,
      isLoading: false,
      ...overrides,
    };
    // Return a function that handles selector calls or returns the full state
    return (selector?: (s: typeof state) => unknown) => {
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseToast.mockReturnValue(mockToast);
    mockUseProjectStore.mockImplementation(createStoreMock());
  });

  it('应该渲染项目列表', () => {
    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

    expect(screen.getByText('测试项目1')).toBeInTheDocument();
    expect(screen.getByText('测试项目2')).toBeInTheDocument();
    expect(screen.getByText('ink')).toBeInTheDocument();
    expect(screen.getByText('watercolor')).toBeInTheDocument();
  });

  it('应该显示正确的项目数量', () => {
    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

    expect(screen.getByText('我的项目')).toBeInTheDocument();
    // 项目卡片应该渲染
    expect(screen.getByText('测试项目1')).toBeInTheDocument();
    expect(screen.getByText('测试项目2')).toBeInTheDocument();
  });

  it('应该在没有项目时显示空状态', () => {
    // Use the helper to create a proper mock with selector support
    const emptyState = {
      projects: [],
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      updateProject: vi.fn(),
      setCurrentProject: vi.fn(),
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      currentProject: null,
      isLoading: false,
    };
    mockUseProjectStore.mockImplementation((selector?: (s: typeof emptyState) => unknown) => {
      if (typeof selector === 'function') {
        return selector(emptyState);
      }
      return emptyState;
    });

    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

    // 新版 UI 使用 Empty 组件，文案已更新
    expect(screen.getByText('开始你的创作之旅')).toBeInTheDocument();
    expect(screen.getByText('创建第一个项目')).toBeInTheDocument();
  });

  it('应该显示重命名菜单选项', async () => {
    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

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
    mockUseProjectStore.mockImplementation(
      createStoreMock({
        updateProject: mockUpdateProject,
      }),
    );

    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

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
    mockUseProjectStore.mockImplementation(
      createStoreMock({
        deleteProject: mockDeleteProject,
      }),
    );

    render(
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>,
    );

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
