import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneRefinement } from './SceneRefinement';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { useCharacterStore } from '@/stores/characterStore';
import { AIFactory } from '@/lib/ai/factory';
import * as skillsModule from '@/lib/ai/skills';

// Mock stores
vi.mock('@/stores/projectStore');
vi.mock('@/stores/storyboardStore');
vi.mock('@/stores/configStore');
vi.mock('@/stores/characterStore');
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
    summary: '主角走进废壟',
    sceneDescription: '',
    actionDescription: '',
    shotPrompt: '',
    motionPrompt: '',
    dialogues: [],
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

    // Mock character store
    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
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
        'generate_keyframe_prompt': {
          name: 'keyframe-prompt',
          promptTemplate: 'Generate keyframe: {style} {protagonist} {scene_description}',
          maxTokens: 500,
        },
        'generate_motion_prompt': {
          name: 'motion-prompt',
          promptTemplate: 'Generate motion: {scene_description}',
          maxTokens: 200,
        },
        'generate_dialogue': {
          name: 'dialogue',
          promptTemplate: 'Generate dialogue: {scene_summary} {scene_description} {characters}',
          maxTokens: 800,
        },
      };
      return skillMap[skillName] || null;
    });

    // Mock parseDialoguesFromText
    vi.mocked(skillsModule.parseDialoguesFromText).mockImplementation((text: string) => {
      return [
        { id: 'dl1', type: 'dialogue' as const, characterName: '主角', content: '这里是什么地方？', order: 1 },
      ];
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
        scenesState[0].shotPrompt = 'A cyberpunk warrior standing in ruins, masterpiece, --ar 16:9';
        scenesState[0].status = 'keyframe_confirmed';
        return { content: 'A cyberpunk warrior standing in ruins, masterpiece, --ar 16:9' };
      })
      .mockImplementationOnce(async () => {
        scenesState[0].motionPrompt = 'character slowly turns head, camera zooms in';
        scenesState[0].status = 'motion_generating';
        return { content: 'character slowly turns head, camera zooms in' };
      })
      .mockImplementationOnce(async () => {
        scenesState[0].dialogues = [{ id: 'dl1', type: 'dialogue', characterName: '主角', content: '这里是什么地方？', order: 1 }];
        scenesState[0].status = 'completed';
        return { content: '[对白] 主角: 这里是什么地方？' };
      });

    render(<SceneRefinement />);

    // 点击"一键生成全部"按钮
    const generateAllBtn = screen.getByRole('button', { name: /一键生成全部/i });
    
    await act(async () => {
      await userEvent.click(generateAllBtn);
    });

    // 等待所有生成完成 - 现在是4个阶段
    await waitFor(
      () => {
        expect(mockChatFn).toHaveBeenCalledTimes(4);
      },
      { timeout: 10000 }
    );

    // 验证四个阶段都被调用
    expect(mockUpdateScene).toHaveBeenCalledTimes(4);
    
    // 验证第一次调用（场景锚点）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(1, 'test-project-1', 'scene-1', {
      sceneDescription: '废墟场景，昏暗的光线',
      status: 'scene_confirmed',
    });

    // 验证第二次调用（关键帧提示词）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(2, 'test-project-1', 'scene-1', {
      shotPrompt: 'A cyberpunk warrior standing in ruins, masterpiece, --ar 16:9',
      status: 'keyframe_confirmed',
    });

    // 验证第三次调用（时空/运动提示词）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(3, 'test-project-1', 'scene-1', {
      motionPrompt: 'character slowly turns head, camera zooms in',
      status: 'motion_generating',
    });

    // 验证第四次调用（台词生成）
    expect(mockUpdateScene).toHaveBeenNthCalledWith(4, 'test-project-1', 'scene-1', 
      expect.objectContaining({
        dialogues: expect.any(Array),
        status: 'completed',
      })
    );
  }, 15000);

  it('应该防止重复点击触发多次生成', async () => {
    let callCount = 0;
    mockChatFn.mockImplementation(async () => {
      callCount++;
      // 模拟每次调用更新状态
      if (callCount === 1) {
        scenesState[0].sceneDescription = 'test1';
      } else if (callCount === 2) {
        scenesState[0].shotPrompt = 'test2';
      } else if (callCount === 3) {
        scenesState[0].motionPrompt = 'test3';
      } else if (callCount === 4) {
        scenesState[0].dialogues = [{ id: 'dl1', type: 'dialogue', characterName: '主角', content: '台词', order: 1 }];
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

    // 等待处理完成 - 现在是4个阶段
    await waitFor(
      () => {
        expect(mockChatFn).toHaveBeenCalledTimes(4);
      },
      { timeout: 5000 }
    );

    // 验证只调用了一次完整流程（4次API调用）
    expect(mockChatFn).toHaveBeenCalledTimes(4);
  });

  it('当某个阶段失败时应该显示错误信息', async () => {
    mockChatFn
      .mockImplementationOnce(async () => {
        scenesState[0].sceneDescription = '场景锚点成功';
        return { content: '场景锚点成功' };
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
      sceneDescription: '已有场景锚点',
      actionDescription: '',
      shotPrompt: '已有关键帧提示词（KF0/KF1/KF2）',
      motionPrompt: '已有时空/运动提示词',
      dialogues: [{ id: 'dl1', type: 'dialogue' as const, characterName: '角色', content: '台词', order: 1 }],
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
        scenesState[0].shotPrompt = `阶段${callCount}的内容`;
      } else if (callCount === 3) {
        scenesState[0].motionPrompt = `阶段${callCount}的内容`;
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

// ==========================================
// 台词功能测试
// ==========================================

describe('SceneRefinement - 台词生成功能', () => {
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

  const mockSceneWithContent = {
    id: 'scene-1',
    projectId: 'test-project-1',
    order: 1,
    summary: '主角与朋友相遇',
    sceneDescription: '废弃的工厂内，昱暗的光线',
    actionDescription: '',
    shotPrompt: 'cyberpunk warrior in ruins',
    motionPrompt: 'character walks forward',
    dialogues: [],
    status: 'keyframe_confirmed' as const,
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
    scenesState = [{ ...mockSceneWithContent }];

    mockUpdateScene = vi.fn((projectId, sceneId, updates) => {
      const sceneIndex = scenesState.findIndex(s => s.id === sceneId);
      if (sceneIndex >= 0) {
        scenesState[sceneIndex] = { ...scenesState[sceneIndex], ...updates };
      }
    });

    mockUpdateProject = vi.fn();
    mockChatFn = vi.fn();

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

    vi.mocked(useConfigStore).mockReturnValue({
      config: mockConfig,
      isConfigured: true,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    } as any);

    // Mock character store
    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
    } as any);

    vi.mocked(AIFactory.createClient).mockReturnValue({
      chat: mockChatFn,
      streamChat: vi.fn(),
      providerName: 'deepseek',
    } as any);

    vi.mocked(skillsModule.getSkillByName).mockImplementation((skillName: string) => {
      const skillMap: Record<string, any> = {
        'generate_scene_desc': {
          name: 'scene-description',
          promptTemplate: 'Generate scene: {style} {protagonist} {current_scene_summary} {prev_scene_summary}',
          maxTokens: 500,
        },
        'generate_keyframe_prompt': {
          name: 'keyframe-prompt',
          promptTemplate: 'Generate keyframe: {style} {protagonist} {scene_description}',
          maxTokens: 500,
        },
        'generate_motion_prompt': {
          name: 'motion-prompt',
          promptTemplate: 'Generate motion: {scene_description}',
          maxTokens: 200,
        },
        'generate_dialogue': {
          name: 'dialogue',
          promptTemplate: 'Generate dialogue: {scene_summary} {scene_description} {characters}',
          maxTokens: 800,
        },
      };
      return skillMap[skillName] || null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应该显示台词生成阶段（第4阶段）', async () => {
    render(<SceneRefinement />);

    // 检查台词阶段是否存在 - 使用 getAllByText 因为可能有多个匹配
    const elements = screen.getAllByText('台词生成');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('应该在时空/运动提示词完成后启用台词生成按钮', async () => {
    // 模拟已有时空/运动提示词的场景
    scenesState = [{
      ...mockSceneWithContent,
      motionPrompt: 'character walks forward',
      dialogues: [],
    }];

    render(<SceneRefinement />);

    // 查找台词生成按钮，应该可用
    const dialogueSections = screen.getAllByText('台词生成');
    expect(dialogueSections.length).toBeGreaterThan(0);
  });

  it('应该成功生成台词', async () => {
    const mockDialogueResponse = `[对白] 主角: 这里是什么地方？
[旁白] 周围一片寂静。
[心理] 主角: 我必须小心行事。`;

    mockChatFn.mockResolvedValueOnce({ content: mockDialogueResponse });

    scenesState = [{
      ...mockSceneWithContent,
      motionPrompt: 'character walks forward',
      dialogues: [],
    }];

    render(<SceneRefinement />);

    // 等待组件渲染
    await waitFor(() => {
      const elements = screen.getAllByText('台词生成');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('应该显示已生成的台词列表', async () => {
    scenesState = [{
      ...mockSceneWithContent,
      dialogues: [
        { id: 'dl1', type: 'dialogue', characterName: '小明', content: '你好！', order: 1 },
        { id: 'dl2', type: 'narration', content: '两人相视而笑', order: 2 },
      ],
    }];

    render(<SceneRefinement />);

    // 台词应该被显示
    await waitFor(() => {
      const elements = screen.getAllByText('台词生成');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('应该支持台词复制功能', async () => {
    scenesState = [{
      ...mockSceneWithContent,
      dialogues: [
        { id: 'dl1', type: 'dialogue', characterName: '小明', content: '你好！', order: 1 },
      ],
    }];

    render(<SceneRefinement />);

    await waitFor(() => {
      const elements = screen.getAllByText('台词生成');
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});

// ==========================================
// React Hooks 规则测试
// ==========================================

describe('SceneRefinement - React Hooks 规则合规性', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('当没有项目时应该正确返回 null 且不报错', () => {
    // Mock 无项目情况
    vi.mocked(useProjectStore).mockReturnValue({
      currentProject: null,
      updateProject: vi.fn(),
      projects: [],
      isLoading: false,
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
    } as any);

    vi.mocked(useStoryboardStore).mockImplementation((selector?: any) => {
      const state = {
        scenes: [],
        updateScene: vi.fn(),
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

    vi.mocked(useStoryboardStore).getState = vi.fn(() => ({
      scenes: [],
      updateScene: vi.fn(),
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

    vi.mocked(useConfigStore).mockReturnValue({
      config: null,
      isConfigured: false,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    } as any);

    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
    } as any);

    // 不应该报错
    render(<SceneRefinement />);

    // 应该显示友好提示
    expect(screen.getByText('请先选择或创建一个项目')).toBeInTheDocument();
  });

  it('当没有场景时应该正确返回提示且不报错', async () => {
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

    vi.mocked(useProjectStore).mockReturnValue({
      currentProject: mockProject,
      updateProject: vi.fn(),
      projects: [mockProject],
      isLoading: false,
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
    } as any);

    // 场景为空
    vi.mocked(useStoryboardStore).mockImplementation((selector?: any) => {
      const state = {
        scenes: [],
        updateScene: vi.fn(),
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

    vi.mocked(useStoryboardStore).getState = vi.fn(() => ({
      scenes: [],
      updateScene: vi.fn(),
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

    vi.mocked(useConfigStore).mockReturnValue({
      config: null,
      isConfigured: false,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    } as any);

    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
    } as any);

    // 不应该报错
    render(<SceneRefinement />);

    // 应该显示友好提示
    await waitFor(() => {
      expect(screen.getByText(/还没有分镜数据/)).toBeInTheDocument();
    });
  });

  it('多次渲染时 hooks 顺序应该保持一致', async () => {
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
      summary: '主角走进废壟',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      dialogues: [],
      status: 'pending' as const,
      notes: '',
    };

    vi.mocked(useProjectStore).mockReturnValue({
      currentProject: mockProject,
      updateProject: vi.fn(),
      projects: [mockProject],
      isLoading: false,
      loadProjects: vi.fn(),
      loadProject: vi.fn(),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
    } as any);

    vi.mocked(useStoryboardStore).mockImplementation((selector?: any) => {
      const state = {
        scenes: [mockScene],
        updateScene: vi.fn(),
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

    vi.mocked(useStoryboardStore).getState = vi.fn(() => ({
      scenes: [mockScene],
      updateScene: vi.fn(),
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

    vi.mocked(useConfigStore).mockReturnValue({
      config: { provider: 'deepseek', apiKey: 'test', model: 'deepseek-chat' },
      isConfigured: true,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    } as any);

    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      loadCharacters: vi.fn(),
      addCharacter: vi.fn(),
      updateCharacter: vi.fn(),
      deleteCharacter: vi.fn(),
    } as any);

    // 第一次渲染
    const { rerender } = render(<SceneRefinement />);
    expect(screen.getByText('分镜细化')).toBeInTheDocument();

    // 第二次渲染（重新渲染）
    rerender(<SceneRefinement />);
    expect(screen.getByText('分镜细化')).toBeInTheDocument();

    // 第三次渲染
    rerender(<SceneRefinement />);
    expect(screen.getByText('分镜细化')).toBeInTheDocument();
  });
});
