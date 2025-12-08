import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneRefinement } from './SceneRefinement';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { AIFactory } from '@/lib/ai/factory';
import * as skillsModule from '@/lib/ai/skills';

// Mock stores
vi.mock('@/stores/projectStore');
vi.mock('@/stores/storyboardStore');
vi.mock('@/stores/configStore');
vi.mock('@/lib/ai/factory');
vi.mock('@/lib/ai/skills');

describe('SceneRefinement - 一键生成全部功能', () => {
  const mockProject = {
    id: 'test-project-1',
    title: '测试项目',
    summary: '测试故事',
    style: '赛博朋克',
    protagonist: '机械战士',
    workflowState: 'SCENE_PROCESSING' as const,
    currentSceneOrder: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  const mockScene = {
    id: 'scene-1',
    projectId: 'test-project-1',
    order: 1,
    summary: '主角走进废墟',
    sceneDescription: '',
    actionDescription: '',
    shotPrompt: '',
    status: 'pending' as const,
    notes: '',
  };

  const mockConfig = {
    provider: 'deepseek' as const,
    apiKey: 'test-key',
    model: 'deepseek-chat',
  };

  let mockUpdateScene: ReturnType<typeof vi.fn>;
  let mockUpdateProject: ReturnType<typeof vi.fn>;
  let mockChatFn: ReturnType<typeof vi.fn>;
  let scenesState: any[];

  beforeEach(() => {
    // 初始化场景状态
    scenesState = [{ ...mockScene }];

    mockUpdateScene = vi.fn((projectId, sceneId, updates) => {
      // 模拟 store 更新
      const sceneIndex = scenesState.findIndex(s => s.id === sceneId);
      if (sceneIndex >= 0) {
        scenesState[sceneIndex] = { ...scenesState[sceneIndex], ...updates };
      }
    });

    mockUpdateProject = vi.fn();
    mockChatFn = vi.fn();

    // Mock project store
    vi.mocked(useProjectStore).mockReturnValue({
      currentProject: mockProject,
      updateProject: mockUpdateProject,
      projects: [mockProject],
      isLoading: false,
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
    } as any);

    // Mock storyboard store - 返回动态的 scenesState
    vi.mocked(useStoryboardStore).mockImplementation((selector?: any) => {
      const state = {
        scenes: scenesState,
        updateScene: mockUpdateScene,
        currentSceneId: null,
        isGenerating: false,
        loadScenes: vi.fn(),
        setScenes: vi.fn(),
        addScene: vi.fn(),
        deleteScene: vi.fn(),
        reorderScenes: vi.fn(),
        setCurrentScene: vi.fn(),
        setGenerating: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    // Mock getState 方法
    vi.mocked(useStoryboardStore).getState = vi.fn(() => ({
      scenes: scenesState,
      updateScene: mockUpdateScene,
      currentSceneId: null,
      isGenerating: false,
      loadScenes: vi.fn(),
      setScenes: vi.fn(),
      addScene: vi.fn(),
      deleteScene: vi.fn(),
      reorderScenes: vi.fn(),
      setCurrentScene: vi.fn(),
      setGenerating: vi.fn(),
    })) as any;

    // Mock config store
    vi.mocked(useConfigStore).mockReturnValue({
      config: mockConfig,
      isConfigured: true,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    } as any);

    // Mock AI Factory
    vi.mocked(AIFactory.createClient).mockReturnValue({
      chat: mockChatFn,
      streamChat: vi.fn(),
      providerName: 'deepseek',
    } as any);

    // Mock skills
    vi.mocked(skillsModule.getSkillByName).mockImplementation((skillName: string) => {
      const skillMap: Record<string, any> = {
        'generate_scene_desc': {
          name: 'scene-description',
          promptTemplate: 'Generate scene: {style} {protagonist} {current_scene_summary} {prev_scene_summary}',
          maxTokens: 500,
        },
        'generate_action_desc': {
          name: 'action-description',
          promptTemplate: 'Generate action: {protagonist} {scene_description} {current_scene_summary}',
          maxTokens: 400,
        },
        'generate_shot_prompt': {
          name: 'prompt-generator',
          promptTemplate: 'Generate prompt: {style} {protagonist} {scene_description} {action_description}',
          maxTokens: 600,
        },
      };
      return skillMap[skillName] || null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功执行一键生成全部流程', async () => {
    // 模拟 AI 返回内容，并在每次调用后更新 scenesState
    mockChatFn
      .mockImplementationOnce(async () => {
        scenesState[0].sceneDescription = '废墟场景，昏暗的光线';
        scenesState[0].status = 'scene_confirmed';
        return { content: '废墟场景，昏暗的光线' };
      })
      .mockImplementationOnce(async () => {
        scenesState[0].actionDescription = '机械战士缓步前行';
        scenesState[0].status = 'action_confirmed';
        return { content: '机械战士缓步前行' };
      })
      .mockImplementationOnce(async () => {
        scenesState[0].shotPrompt = 'A cyberpunk warrior walking in ruins, --ar 16:9';
        scenesState[0].status = 'completed';
        return { content: 'A cyberpunk warrior walking in ruins, --ar 16:9' };
      });

    render(<SceneRefinement />);

    // 点击"一键生成全部"按钮
    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    await act(async () => {
      await userEvent.click(generateAllBtn);
    });

    // 等待所有生成完成
    await waitFor(
      () => {
        expect(mockChatFn).toHaveBeenCalledTimes(3);
      },
      { timeout: 10000 }
    );

    // 验证三个阶段都被调用
    expect(mockUpdateScene).toHaveBeenCalledTimes(3);
    
    // 验证第一次调用（场景描述）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(1, 'test-project-1', 'scene-1', {
      sceneDescription: '废墟场景，昏暗的光线',
      status: 'scene_confirmed',
    });

    // 验证第二次调用（动作描述）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(2, 'test-project-1', 'scene-1', {
      actionDescription: '机械战士缓步前行',
      status: 'action_confirmed',
    });

    // 验证第三次调用（镜头提示词）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(3, 'test-project-1', 'scene-1', {
      shotPrompt: 'A cyberpunk warrior walking in ruins, --ar 16:9',
      status: 'completed',
    });
  }, 15000);

  it('应该防止重复点击触发多次生成', async () => {
    let callCount = 0;
    mockChatFn.mockImplementation(async () => {
      callCount++;
      // 模拟每次调用更新状态
      if (callCount === 1) {
        scenesState[0].sceneDescription = 'test1';
      } else if (callCount === 2) {
        scenesState[0].actionDescription = 'test2';
      } else if (callCount === 3) {
        scenesState[0].shotPrompt = 'test3';
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      return { content: `test${callCount}` };
    });

    render(<SceneRefinement />);

    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    // 快速点击两次
    await act(async () => {
      await userEvent.click(generateAllBtn);
      await userEvent.click(generateAllBtn); // 第二次点击应该被忽略
    });

    // 等待处理完成
    await waitFor(
      () => {
        expect(mockChatFn).toHaveBeenCalledTimes(3);
      },
      { timeout: 3000 }
    );

    // 验证只调用了一次完整流程（3次API调用）
    expect(mockChatFn).toHaveBeenCalledTimes(3);
  });

  it('当某个阶段失败时应该显示错误信息', async () => {
    mockChatFn
      .mockImplementationOnce(async () => {
        scenesState[0].sceneDescription = '场景描述成功';
        return { content: '场景描述成功' };
      })
      .mockRejectedValueOnce(new Error('API调用失败'));

    render(<SceneRefinement />);

    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    await act(async () => {
      await userEvent.click(generateAllBtn);
    });

    // 等待错误显示
    await waitFor(() => {
      const errorMsg = screen.queryByText(/生成失败|API调用失败|动作描述生成失败/);
      expect(errorMsg).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('应该在生成过程中显示正确的状态', async () => {
    mockChatFn.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { content: 'test' };
    });

    render(<SceneRefinement />);

    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    await act(async () => {
      await userEvent.click(generateAllBtn);
    });

    // 验证按钮变为"批量生成中..."
    await waitFor(() => {
      expect(screen.getByText('批量生成中...')).toBeInTheDocument();
    });

    // 验证按钮被禁用
    const loadingBtn = screen.getByRole('button', { name: /批量生成中/i });
    expect(loadingBtn).toBeDisabled();
  });

  it('应该在所有内容已生成时禁用按钮', async () => {
    // 模拟已完成的场景
    scenesState = [{
      ...mockScene,
      sceneDescription: '已有场景描述',
      actionDescription: '已有动作描述',
      shotPrompt: '已有提示词',
      status: 'completed' as const,
    }];

    render(<SceneRefinement />);

    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    expect(generateAllBtn).toBeDisabled();
  });

  it('应该正确读取每个阶段后的最新状态', async () => {
    let callCount = 0;
    
    mockChatFn.mockImplementation(async () => {
      callCount++;
      // 模拟状态更新
      if (callCount === 1) {
        scenesState[0].sceneDescription = `阶段${callCount}的内容`;
      } else if (callCount === 2) {
        scenesState[0].actionDescription = `阶段${callCount}的内容`;
      } else if (callCount === 3) {
        scenesState[0].shotPrompt = `阶段${callCount}的内容`;
      }
      return { content: `阶段${callCount}的内容` };
    });

    render(<SceneRefinement />);

    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    await act(async () => {
      await userEvent.click(generateAllBtn);
    });

    await waitFor(
      () => {
        expect(mockChatFn).toHaveBeenCalledTimes(3);
      },
      { timeout: 10000 }
    );

    // 验证 getState 被调用来获取最新状态
    expect(useStoryboardStore.getState).toHaveBeenCalled();
  }, 15000);
});
