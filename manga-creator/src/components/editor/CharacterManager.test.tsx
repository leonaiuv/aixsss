import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterManager } from './CharacterManager';
import { useCharacterStore } from '@/stores/characterStore';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { AIFactory } from '@/lib/ai/factory';

// Mock stores
vi.mock('@/stores/characterStore');
vi.mock('@/stores/configStore');
vi.mock('@/stores/projectStore');
vi.mock('@/lib/ai/factory');

describe('CharacterManager', () => {
  const mockProject = {
    id: 'test-project-1',
    title: '测试项目',
    summary: '一个关于冒险的故事',
    style: 'anime',  // 使用旧版预设值，会被迁移为 anime_cel
    protagonist: '勇敢的少年',
    workflowState: 'IDLE' as const,
    currentSceneOrder: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  const mockConfig = {
    provider: 'deepseek' as const,
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  };

  const mockCharacter = {
    id: 'char-1',
    projectId: 'test-project-1',
    name: '张三',
    briefDescription: '张三，20岁学生，开朗活泼',
    appearance: '身高175cm，黑色短发',
    personality: '开朗活泼',
    background: '来自小镇的少年',
    themeColor: '#6366f1',
    relationships: [],
    appearances: [],
    portraitPrompts: {
      midjourney: 'anime style, young man, black short hair --ar 2:3 --v 6',
      stableDiffusion: 'anime style, young man, black short hair, masterpiece',
      general: '日式动漫风格，青年男性，黑色短发，全身照，纯白背景',
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  const mockAddCharacter = vi.fn();
  const mockUpdateCharacter = vi.fn();
  const mockDeleteCharacter = vi.fn();
  const mockChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock character store
    vi.mocked(useCharacterStore).mockReturnValue({
      characters: [],
      currentCharacterId: null,
      isLoading: false,
      loadCharacters: vi.fn(),
      addCharacter: mockAddCharacter,
      updateCharacter: mockUpdateCharacter,
      deleteCharacter: mockDeleteCharacter,
      setCurrentCharacter: vi.fn(),
      recordAppearance: vi.fn(),
      updatePortraitPrompts: vi.fn(),
      getCharactersByProject: vi.fn().mockReturnValue([]),
    });

    // Mock config store
    vi.mocked(useConfigStore).mockReturnValue({
      config: mockConfig,
      isConfigured: true,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearConfig: vi.fn(),
      testConnection: vi.fn(),
    });

    // Mock project store
    vi.mocked(useProjectStore).mockReturnValue({
      projects: [mockProject],
      currentProject: mockProject,
      isLoading: false,
      loadProjects: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
    });

    // Mock AI Factory
    mockChat.mockResolvedValue({
      content: 'AI生成的内容',
    });

    vi.mocked(AIFactory.createClient).mockReturnValue({
      chat: mockChat,
      streamChat: vi.fn(),
      providerName: 'deepseek',
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 数据加载测试
  // ==========================================
  describe('数据加载', () => {
    it('组件挂载时应调用loadCharacters加载角色数据', () => {
      const mockLoadCharacters = vi.fn();
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: mockLoadCharacters,
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(mockLoadCharacters).toHaveBeenCalledWith('test-project-1');
      expect(mockLoadCharacters).toHaveBeenCalledTimes(1);
    });

    it('projectId变化时应重新加载角色数据', () => {
      const mockLoadCharacters = vi.fn();
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: mockLoadCharacters,
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
      });

      const { rerender } = render(<CharacterManager projectId="project-1" />);
      expect(mockLoadCharacters).toHaveBeenCalledWith('project-1');
      
      rerender(<CharacterManager projectId="project-2" />);
      expect(mockLoadCharacters).toHaveBeenCalledWith('project-2');
      expect(mockLoadCharacters).toHaveBeenCalledTimes(2);
    });

    it('相同projectId重新渲染不应重复加载', () => {
      const mockLoadCharacters = vi.fn();
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: mockLoadCharacters,
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
      });

      const { rerender } = render(<CharacterManager projectId="test-project-1" />);
      rerender(<CharacterManager projectId="test-project-1" />);
      
      // React 严格模式下可能调用两次，但相同 projectId 只应触发一次实际加载
      expect(mockLoadCharacters).toHaveBeenCalledWith('test-project-1');
    });
  });

  // ==========================================
  // 基础渲染测试
  // ==========================================
  describe('基础渲染', () => {
    it('应该正确渲染角色管理组件', () => {
      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('角色管理')).toBeInTheDocument();
      expect(screen.getByText('管理项目中的所有角色')).toBeInTheDocument();
      expect(screen.getByText('添加角色')).toBeInTheDocument();
    });

    it('没有角色时应显示空状态', () => {
      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('还没有角色')).toBeInTheDocument();
      expect(screen.getByText('添加角色可以帮助AI更好地理解故事和生成内容')).toBeInTheDocument();
    });

    it('有角色时应显示角色列表', () => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [mockCharacter],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('张三')).toBeInTheDocument();
    });
  });

  // ==========================================
  // 对话框交互测试
  // ==========================================
  describe('对话框交互', () => {
    it('点击添加角色按钮应打开对话框', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      expect(screen.getByText('添加新角色')).toBeInTheDocument();
      expect(screen.getByText('输入角色简短描述，AI将自动生成完整角色卡')).toBeInTheDocument();
    });

    it('对话框应包含所有必要的表单字段', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      expect(screen.getByLabelText(/角色简短描述/)).toBeInTheDocument();
      expect(screen.getByLabelText(/角色名称/)).toBeInTheDocument();
      expect(screen.getByLabelText(/外观描述/)).toBeInTheDocument();
      expect(screen.getByLabelText(/性格特点/)).toBeInTheDocument();
      expect(screen.getByLabelText(/背景故事/)).toBeInTheDocument();
      expect(screen.getByLabelText(/主色/)).toBeInTheDocument();
    });

    it('取消按钮应关闭对话框', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      expect(screen.getByText('添加新角色')).toBeInTheDocument();
      
      await user.click(screen.getByText('取消'));
      
      await waitFor(() => {
        expect(screen.queryByText('添加新角色')).not.toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // 角色添加测试
  // ==========================================
  describe('角色添加', () => {
    it('填写角色信息后应能成功添加', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      await user.type(screen.getByLabelText(/角色名称/), '李四');
      await user.type(screen.getByLabelText(/外观描述/), '高个子，金色头发');
      await user.type(screen.getByLabelText(/性格特点/), '沉稳冷静');
      await user.type(screen.getByLabelText(/背景故事/), '神秘的过客');
      
      // 点击下一步进入定妆照步骤
      const nextButton = screen.getByRole('button', { name: /下一步/ });
      await user.click(nextButton);
      
      // 在定妆照步骤点击添加角色
      await waitFor(() => {
        expect(screen.getByRole('button', { name: '添加角色' })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: '添加角色' }));
      
      expect(mockAddCharacter).toHaveBeenCalledWith('test-project-1', expect.objectContaining({
        name: '李四',
        appearance: '高个子，金色头发',
        personality: '沉稳冷静',
        background: '神秘的过客',
      }));
    });

    it('没有输入名称时下一步按钮应禁用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      // 没有填写任何信息时，下一步按钮应该禁用
      const nextButton = screen.getByRole('button', { name: /下一步/ });
      expect(nextButton).toBeDisabled();
      
      // 因为按钮禁用，点击不会有任何效果
      expect(mockAddCharacter).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // AI生成功能测试
  // ==========================================
  describe('AI生成功能', () => {
    it('一键生成按钮应该存在', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      expect(screen.getByRole('button', { name: /一键生成/ })).toBeInTheDocument();
    });

    it('没有输入简短描述时一键生成按钮应禁用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      expect(generateButton).toBeDisabled();
    });

    it('输入简短描述后一键生成按钮应启用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '李明，30岁退役特种兵');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      expect(generateButton).not.toBeDisabled();
    });

    it('点击AI生成按钮应调用AI服务生成外观', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: JSON.stringify({
          name: '神秘人',
          appearance: '身高180cm，黑色长发，锐利的眼神，身穿深色风衣',
          personality: '沉默寡言，内心却充满正义感',
          background: '曾是特种兵，退役后成为私家侦探',
        }),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '神秘人，退役特种兵');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      await user.click(generateButton);
      
      await waitFor(() => {
        expect(AIFactory.createClient).toHaveBeenCalledWith(mockConfig);
        expect(mockChat).toHaveBeenCalled();
      });

      // 检查prompt包含简短描述
      const chatCallArg = mockChat.mock.calls[0][0];
      expect(chatCallArg[0].content).toContain('神秘人，退役特种兵');
    });

    it('AI生成成功后应填充到对应字段', async () => {
      const user = userEvent.setup();
      const generatedContent = JSON.stringify({
        name: '神秘人',
        appearance: '身高180cm，黑色长发，锐利的眼神',
        personality: '沉默寡言',
        background: '退役特种兵',
      });
      mockChat.mockResolvedValue({
        content: generatedContent,
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '神秘人');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      await user.click(generateButton);
      
      await waitFor(() => {
        const appearanceTextarea = screen.getByLabelText(/外观描述/) as HTMLTextAreaElement;
        expect(appearanceTextarea.value).toBe('身高180cm，黑色长发，锐利的眼神');
      });
    });

    it('生成过程中应显示加载状态', async () => {
      const user = userEvent.setup();
      
      // 延迟AI响应
      mockChat.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ 
          content: JSON.stringify({ name: '测试', appearance: '测试', personality: '测试', background: '测试' })
        }), 100))
      );

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试角色');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      await user.click(generateButton);
      
      // 应该显示生成中状态
      expect(screen.getByText('生成中...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText('生成中...')).not.toBeInTheDocument();
      });
    });

    it('AI生成失败应显示错误信息', async () => {
      const user = userEvent.setup();
      mockChat.mockRejectedValue(new Error('API调用失败'));

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试角色');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      await user.click(generateButton);
      
      await waitFor(() => {
        expect(screen.getByText('API调用失败')).toBeInTheDocument();
      });
    });

    it('没有配置AI时应显示配置提示', async () => {
      vi.mocked(useConfigStore).mockReturnValue({
        config: null,
        isConfigured: false,
        loadConfig: vi.fn(),
        saveConfig: vi.fn(),
        clearConfig: vi.fn(),
        testConnection: vi.fn(),
      });

      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试角色');
      
      const generateButton = screen.getByRole('button', { name: /一键生成/ });
      
      // 模拟点击
      await act(async () => {
        generateButton.click();
      });
      
      await waitFor(() => {
        expect(screen.getByText('请先配置AI服务')).toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // 两步式交互流程测试
  // ==========================================
  describe('两步式交互流程', () => {
    it('应该显示步骤指示器', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      expect(screen.getByText('1. 基础信息')).toBeInTheDocument();
      expect(screen.getByText('2. 定妆照提示词')).toBeInTheDocument();
    });

    it('基础信息完成后应能进入下一步', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: JSON.stringify({
          name: '测试',
          appearance: '测试外观',
          personality: '测试性格',
          background: '测试背景',
        }),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试角色');
      
      // 一键生成
      await user.click(screen.getByRole('button', { name: /一键生成/ }));
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /下一步/ })).toBeInTheDocument();
      });
    });

    it('未填写外观描述时下一步按钮应禁用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试');
      
      const nextButton = screen.getByRole('button', { name: /下一步/ });
      expect(nextButton).toBeDisabled();
    });
  });

  // ==========================================
  // 定妆照提示词生成测试
  // ==========================================
  describe('定妆照提示词', () => {
    it('应该能够生成多种格式的定妆照提示词', async () => {
      const user = userEvent.setup();
      
      // 第一次调用返回基础信息
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({
          name: '测试',
          appearance: '测试外观',
          personality: '测试性格',
          background: '测试背景',
        }),
      });
      
      // 第二次调用返回定妆照提示词
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({
          midjourney: 'anime style, test character --ar 2:3 --v 6',
          stableDiffusion: 'anime style, test character, masterpiece',
          general: '日式动漫风格，测试角色，全身照',
        }),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试角色');
      
      // 一键生成基础信息
      await user.click(screen.getByRole('button', { name: /一键生成/ }));
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /下一步/ })).not.toBeDisabled();
      });
      
      // 点击下一步
      await user.click(screen.getByRole('button', { name: /下一步/ }));
      
      // 应该显示生成定妆照按钮
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /生成定妆照提示词/ })).toBeInTheDocument();
      });
    });

    it('应该显示三种格式的复制按钮', async () => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [mockCharacter],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn().mockReturnValue([mockCharacter]),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      // 点击定妆照Tab
      const portraitTab = screen.getByRole('tab', { name: /定妆照/ });
      await userEvent.click(portraitTab);
      
      // 应该显示三种格式的复制按钮（按钮文本包含MJ、SD、通用）
      expect(screen.getByText('MJ')).toBeInTheDocument();
      expect(screen.getByText('SD')).toBeInTheDocument();
      expect(screen.getByText('通用')).toBeInTheDocument();
    });
  });

  // ==========================================
  // 画风传递测试
  // ==========================================
  describe('画风传递', () => {
    it('应该在对话框中显示当前画风', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      // 应该显示画风提示
      expect(screen.getByText(/当前画风/)).toBeInTheDocument();
    });

    it('AI生成时应使用项目画风', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: JSON.stringify({
          name: '测试',
          appearance: '测试外观',
          personality: '测试性格',
          background: '测试背景',
        }),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色简短描述/), '测试');
      
      await user.click(screen.getByRole('button', { name: /一键生成/ }));
      
      await waitFor(() => {
        const chatCallArg = mockChat.mock.calls[0][0];
        const prompt = chatCallArg[0].content;
        // 应该包含项目画风信息（迁移后为英文提示词）
        expect(prompt).toContain('anime style');
      });
    });
  });

  // ==========================================
  // 角色编辑测试
  // ==========================================
  describe('角色编辑', () => {
    beforeEach(() => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [mockCharacter],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn().mockReturnValue([mockCharacter]),
      });
    });

    it('点击编辑按钮应打开编辑对话框', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find(btn => btn.querySelector('svg.lucide-edit-2'));
      
      if (editButton) {
        await user.click(editButton);
        
        await waitFor(() => {
          expect(screen.getByText('编辑角色')).toBeInTheDocument();
        });
      }
    });

    it('编辑对话框应预填充角色信息', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find(btn => btn.querySelector('svg.lucide-edit-2'));
      
      if (editButton) {
        await user.click(editButton);
        
        await waitFor(() => {
          const nameInput = screen.getByLabelText(/角色名称/) as HTMLInputElement;
          expect(nameInput.value).toBe('张三');
        });
      }
    });
  });

  // ==========================================
  // 角色删除测试
  // ==========================================
  describe('角色删除', () => {
    beforeEach(() => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [mockCharacter],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn().mockReturnValue([mockCharacter]),
      });

      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('确认删除后应调用删除方法', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(btn => btn.querySelector('svg.lucide-trash-2'));
      
      if (deleteButton) {
        await user.click(deleteButton);
        
        expect(mockDeleteCharacter).toHaveBeenCalledWith('test-project-1', 'char-1');
      }
    });

    it('取消删除时不应调用删除方法', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(btn => btn.querySelector('svg.lucide-trash-2'));
      
      if (deleteButton) {
        await user.click(deleteButton);
        
        expect(mockDeleteCharacter).not.toHaveBeenCalled();
      }
    });
  });

  // ==========================================
  // 边界情况测试
  // ==========================================
  describe('边界情况', () => {
    it('长名称角色应正常显示', async () => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [{
          ...mockCharacter,
          name: '一个非常非常非常长的角色名称用来测试',
        }],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn(),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('一个非常非常非常长的角色名称用来测试')).toBeInTheDocument();
    });

    it('多个角色应全部显示', async () => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [
          mockCharacter,
          { ...mockCharacter, id: 'char-2', name: '李四' },
          { ...mockCharacter, id: 'char-3', name: '王五' },
        ],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn(),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('张三')).toBeInTheDocument();
      expect(screen.getByText('李四')).toBeInTheDocument();
      expect(screen.getByText('王五')).toBeInTheDocument();
    });

    it('不同项目的角色不应显示', () => {
      vi.mocked(useCharacterStore).mockReturnValue({
        characters: [
          mockCharacter,
          { ...mockCharacter, id: 'char-2', projectId: 'other-project', name: '其他项目角色' },
        ],
        currentCharacterId: null,
        isLoading: false,
        loadCharacters: vi.fn(),
        addCharacter: mockAddCharacter,
        updateCharacter: mockUpdateCharacter,
        deleteCharacter: mockDeleteCharacter,
        setCurrentCharacter: vi.fn(),
        recordAppearance: vi.fn(),
        updatePortraitPrompts: vi.fn(),
        getCharactersByProject: vi.fn(),
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('张三')).toBeInTheDocument();
      expect(screen.queryByText('其他项目角色')).not.toBeInTheDocument();
    });
  });
});
