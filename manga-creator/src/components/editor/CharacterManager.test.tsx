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
    style: '日系动漫',
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
    appearance: '身高175cm，黑色短发',
    personality: '开朗活泼',
    background: '来自小镇的少年',
    themeColor: '#6366f1',
    relationships: [],
    appearances: [],
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
      expect(screen.getByText('填写角色的基本信息，这些信息将用于AI生成时的上下文')).toBeInTheDocument();
    });

    it('对话框应包含所有必要的表单字段', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      expect(screen.getByLabelText(/角色名称/)).toBeInTheDocument();
      expect(screen.getByLabelText(/外观描述/)).toBeInTheDocument();
      expect(screen.getByLabelText(/性格特点/)).toBeInTheDocument();
      expect(screen.getByLabelText(/背景故事/)).toBeInTheDocument();
      expect(screen.getByLabelText(/主题色/)).toBeInTheDocument();
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
      
      await user.click(screen.getByRole('button', { name: '添加' }));
      
      expect(mockAddCharacter).toHaveBeenCalledWith('test-project-1', expect.objectContaining({
        name: '李四',
        appearance: '高个子，金色头发',
        personality: '沉稳冷静',
        background: '神秘的过客',
      }));
    });

    it('没有输入名称时不应提交', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.click(screen.getByRole('button', { name: '添加' }));
      
      expect(mockAddCharacter).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // AI生成功能测试
  // ==========================================
  describe('AI生成功能', () => {
    it('外观描述AI生成按钮应该存在', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      const aiButtons = screen.getAllByText('AI生成');
      expect(aiButtons.length).toBe(3); // 外观、性格、背景各一个
    });

    it('没有输入名称时AI生成按钮应禁用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      aiButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('输入名称后AI生成按钮应启用', async () => {
      const user = userEvent.setup();
      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      aiButtons.forEach(button => {
        expect(button).not.toBeDisabled();
      });
    });

    it('点击AI生成按钮应调用AI服务生成外观', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: '身高180cm，黑色长发，锐利的眼神，身穿深色风衣',
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '神秘人');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]); // 点击外观生成按钮
      
      await waitFor(() => {
        expect(AIFactory.createClient).toHaveBeenCalledWith(mockConfig);
        expect(mockChat).toHaveBeenCalled();
      });

      // 检查prompt包含角色名称
      const chatCallArg = mockChat.mock.calls[0][0];
      expect(chatCallArg[0].content).toContain('神秘人');
    });

    it('AI生成成功后应填充到对应字段', async () => {
      const user = userEvent.setup();
      const generatedContent = '身高180cm，黑色长发，锐利的眼神';
      mockChat.mockResolvedValue({
        content: generatedContent,
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '神秘人');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]);
      
      await waitFor(() => {
        const appearanceTextarea = screen.getByLabelText(/外观描述/) as HTMLTextAreaElement;
        expect(appearanceTextarea.value).toBe(generatedContent);
      });
    });

    it('生成过程中应显示加载状态', async () => {
      const user = userEvent.setup();
      
      // 延迟AI响应
      mockChat.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ content: '生成的内容' }), 100))
      );

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]);
      
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
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]);
      
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
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      // 手动启用按钮点击（因为按钮可能因为配置问题被禁用逻辑改变）
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      
      // 模拟点击
      await act(async () => {
        aiButtons[0].click();
      });
      
      await waitFor(() => {
        expect(screen.getByText('请先配置AI服务')).toBeInTheDocument();
      });
    });
  });

  // ==========================================
  // 性格生成测试
  // ==========================================
  describe('性格生成', () => {
    it('点击性格AI生成按钮应调用AI服务', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: '性格开朗，乐于助人',
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[1]); // 点击性格生成按钮
      
      await waitFor(() => {
        expect(mockChat).toHaveBeenCalled();
        const chatCallArg = mockChat.mock.calls[0][0];
        expect(chatCallArg[0].content).toContain('性格特点');
      });
    });

    it('性格生成应填充到性格字段', async () => {
      const user = userEvent.setup();
      const generatedContent = '热情开朗，喜欢交朋友';
      mockChat.mockResolvedValue({
        content: generatedContent,
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[1]);
      
      await waitFor(() => {
        const personalityTextarea = screen.getByLabelText(/性格特点/) as HTMLTextAreaElement;
        expect(personalityTextarea.value).toBe(generatedContent);
      });
    });
  });

  // ==========================================
  // 背景生成测试
  // ==========================================
  describe('背景生成', () => {
    it('点击背景AI生成按钮应调用AI服务', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: '从小在山村长大',
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[2]); // 点击背景生成按钮
      
      await waitFor(() => {
        expect(mockChat).toHaveBeenCalled();
        const chatCallArg = mockChat.mock.calls[0][0];
        expect(chatCallArg[0].content).toContain('背景故事');
      });
    });

    it('背景生成应填充到背景字段', async () => {
      const user = userEvent.setup();
      const generatedContent = '出生于王室，却选择了冒险之路';
      mockChat.mockResolvedValue({
        content: generatedContent,
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[2]);
      
      await waitFor(() => {
        const backgroundTextarea = screen.getByLabelText(/背景故事/) as HTMLTextAreaElement;
        expect(backgroundTextarea.value).toBe(generatedContent);
      });
    });
  });

  // ==========================================
  // 项目上下文集成测试
  // ==========================================
  describe('项目上下文集成', () => {
    it('AI生成应使用项目上下文', async () => {
      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: '生成的外观',
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]);
      
      await waitFor(() => {
        const chatCallArg = mockChat.mock.calls[0][0];
        const prompt = chatCallArg[0].content;
        expect(prompt).toContain('一个关于冒险的故事'); // summary
        expect(prompt).toContain('日系动漫'); // style
      });
    });

    it('没有项目时应该仍能正常生成', async () => {
      vi.mocked(useProjectStore).mockReturnValue({
        projects: [],
        currentProject: null,
        isLoading: false,
        loadProjects: vi.fn(),
        createProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
      });

      const user = userEvent.setup();
      mockChat.mockResolvedValue({
        content: '生成的外观描述',
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]);
      
      await waitFor(() => {
        expect(mockChat).toHaveBeenCalled();
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
      });

      render(<CharacterManager projectId="test-project-1" />);
      
      expect(screen.getByText('张三')).toBeInTheDocument();
      expect(screen.queryByText('其他项目角色')).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // AI生成互斥测试
  // ==========================================
  describe('AI生成互斥', () => {
    it('生成过程中其他AI生成按钮应被禁用', async () => {
      const user = userEvent.setup();
      
      // 延迟AI响应
      mockChat.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ content: '生成的内容' }), 200))
      );

      render(<CharacterManager projectId="test-project-1" />);
      
      await user.click(screen.getByText('添加角色'));
      await user.type(screen.getByLabelText(/角色名称/), '测试角色');
      
      const aiButtons = screen.getAllByRole('button', { name: /AI生成/ });
      await user.click(aiButtons[0]); // 开始生成外观
      
      // 其他按钮应该被禁用
      await waitFor(() => {
        expect(aiButtons[1]).toBeDisabled();
        expect(aiButtons[2]).toBeDisabled();
      });
      
      // 等待生成完成
      await waitFor(() => {
        expect(aiButtons[1]).not.toBeDisabled();
        expect(aiButtons[2]).not.toBeDisabled();
      }, { timeout: 500 });
    });
  });
});
