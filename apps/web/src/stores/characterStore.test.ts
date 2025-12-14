import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCharacterStore } from './characterStore';

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => mockLocalStorage.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage.store[key];
  }),
  clear: vi.fn(() => {
    mockLocalStorage.store = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('CharacterStore', () => {
  beforeEach(() => {
    // 重置store状态
    useCharacterStore.setState({ characters: [], currentCharacterId: null, isLoading: false });
    mockLocalStorage.clear();
    vi.clearAllMocks();
  });

  describe('addCharacter', () => {
    it('应该能够添加新角色', () => {
      const store = useCharacterStore.getState();

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '李明',
        appearance: '20岁青年，黑发，身穿白衬衫',
        personality: '开朗、勇敢、正义感强',
        background: '普通大学生',
        relationships: [],
        appearances: [],
      });

      const characters = useCharacterStore.getState().characters;
      expect(characters).toHaveLength(1);
      expect(characters[0].name).toBe('李明');
      expect(characters[0].projectId).toBe('project-1');
    });

    it('应该自动生成ID和时间戳', () => {
      const store = useCharacterStore.getState();

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '王芳',
        appearance: '女性，长发',
        personality: '温柔',
        background: '教师',
        relationships: [],
        appearances: [],
      });

      const characters = useCharacterStore.getState().characters;
      expect(characters[0].id).toBeDefined();
      expect(characters[0].createdAt).toBeDefined();
      expect(characters[0].updatedAt).toBeDefined();
    });
  });

  describe('updateCharacter', () => {
    it('应该能够更新角色信息', () => {
      const store = useCharacterStore.getState();

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '张三',
        appearance: '初始外观',
        personality: '初始性格',
        background: '初始背景',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.updateCharacter('project-1', characterId, {
        appearance: '更新后的外观',
        personality: '更新后的性格',
      });

      const updatedCharacter = useCharacterStore
        .getState()
        .characters.find((c) => c.id === characterId);

      expect(updatedCharacter?.appearance).toBe('更新后的外观');
      expect(updatedCharacter?.personality).toBe('更新后的性格');
      expect(updatedCharacter?.background).toBe('初始背景'); // 未更新的字段保持不变
    });
  });

  describe('deleteCharacter', () => {
    it('应该能够删除角色', () => {
      const store = useCharacterStore.getState();

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '待删除角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;
      store.deleteCharacter('project-1', characterId);

      expect(useCharacterStore.getState().characters).toHaveLength(0);
    });
  });

  describe('getProjectCharacters (旧API)', () => {
    it('应该能够按项目ID筛选角色', () => {
      const store = useCharacterStore.getState();

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '角色1',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      store.addCharacter('project-2', {
        projectId: 'project-2',
        name: '角色2',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '角色3',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const project1Characters = useCharacterStore.getState().getCharactersByProject('project-1');
      expect(project1Characters).toHaveLength(2);
      expect(project1Characters.every((c) => c.projectId === 'project-1')).toBe(true);
    });
  });

  // ==========================================
  // 新功能测试：定妆照提示词
  // ==========================================
  describe('updatePortraitPrompts', () => {
    it('应该能够更新角色的定妆照提示词', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '黑发青年',
        personality: '开朗',
        background: '学生',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;
      const prompts = {
        midjourney: 'anime style, black hair young man, full body, white background --ar 2:3 --v 6',
        stableDiffusion: 'anime style, black hair young man, full body, white background, masterpiece, best quality',
        general: '日式动漫风格，黑发青年，全身照，纯白背景',
      };

      useCharacterStore.getState().updatePortraitPrompts('project-1', characterId, prompts);

      const updatedCharacter = useCharacterStore.getState().characters.find(c => c.id === characterId);
      expect(updatedCharacter?.portraitPrompts).toEqual(prompts);
    });

    it('更新定妆照提示词应该更新updatedAt时间戳', async () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;
      const originalUpdatedAt = useCharacterStore.getState().characters[0].updatedAt;

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      const prompts = {
        midjourney: 'test prompt',
        stableDiffusion: 'test prompt',
        general: '测试提示词',
      };

      useCharacterStore.getState().updatePortraitPrompts('project-1', characterId, prompts);

      const updatedCharacter = useCharacterStore.getState().characters.find(c => c.id === characterId);
      expect(updatedCharacter?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('更新定妆照提示词应该持久化到localStorage', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;
      const prompts = {
        midjourney: 'MJ prompt',
        stableDiffusion: 'SD prompt',
        general: '通用提示词',
      };

      useCharacterStore.getState().updatePortraitPrompts('project-1', characterId, prompts);

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(mockLocalStorage.store['aixs_characters_project-1']);
      expect(savedData[0].portraitPrompts).toEqual(prompts);
    });

    it('更新不存在的角色ID应该无效果', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const prompts = {
        midjourney: 'test',
        stableDiffusion: 'test',
        general: '测试',
      };

      useCharacterStore.getState().updatePortraitPrompts('project-1', 'non-existent-id', prompts);

      const character = useCharacterStore.getState().characters[0];
      expect(character.portraitPrompts).toBeUndefined();
    });
  });

  // ==========================================
  // getCharactersByProject 测试
  // ==========================================
  describe('getCharactersByProject', () => {
    it('应该返回指定项目的所有角色', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '角色A',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      store.addCharacter('project-2', {
        projectId: 'project-2',
        name: '角色B',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '角色C',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const project1Chars = useCharacterStore.getState().getCharactersByProject('project-1');
      expect(project1Chars).toHaveLength(2);
      expect(project1Chars.every(c => c.projectId === 'project-1')).toBe(true);
    });

    it('项目没有角色时应返回空数组', () => {
      const project1Chars = useCharacterStore.getState().getCharactersByProject('empty-project');
      expect(project1Chars).toHaveLength(0);
      expect(Array.isArray(project1Chars)).toBe(true);
    });
  });

  // ==========================================
  // 新字段存储测试
  // ==========================================
  describe('新字段存储', () => {
    it('应该能够存储briefDescription字段', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '李明',
        briefDescription: '李明，30岁退役特种兵，沉默寡言',
        appearance: '黑发短发',
        personality: '沉默',
        background: '退役军人',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.briefDescription).toBe('李明，30岁退役特种兵，沉默寡言');
    });

    it('应该能够存储portraitPrompts字段', () => {
      const store = useCharacterStore.getState();
      const prompts = {
        midjourney: 'MJ prompt text',
        stableDiffusion: 'SD prompt text',
        general: '通用提示词文本',
      };
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试',
        appearance: '',
        personality: '',
        background: '',
        portraitPrompts: prompts,
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.portraitPrompts).toEqual(prompts);
    });

    it('应该能够存储customStyle字段', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试',
        appearance: '',
        personality: '',
        background: '',
        customStyle: '赛博朋克风格',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.customStyle).toBe('赛博朋克风格');
    });

    it('更新时应该能够保留新字段', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试',
        briefDescription: '原始描述',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.updateCharacter('project-1', characterId, {
        name: '更新后的名称',
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.name).toBe('更新后的名称');
      expect(character.briefDescription).toBe('原始描述'); // 未更新的字段保持不变
    });
  });

  // ==========================================
  // loadCharacters 测试
  // ==========================================
  describe('loadCharacters', () => {
    it('应该能够从localStorage加载角色数据', () => {
      const storedCharacters = [
        {
          id: 'char-1',
          projectId: 'project-1',
          name: '存储的角色',
          appearance: '外观',
          personality: '性格',
          background: '背景',
          relationships: [],
          appearances: [],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];
      mockLocalStorage.store['aixs_characters_project-1'] = JSON.stringify(storedCharacters);

      useCharacterStore.getState().loadCharacters('project-1');

      expect(useCharacterStore.getState().characters).toHaveLength(1);
      expect(useCharacterStore.getState().characters[0].name).toBe('存储的角色');
    });

    it('localStorage为空时应该返回空数组', () => {
      useCharacterStore.getState().loadCharacters('empty-project');

      expect(useCharacterStore.getState().characters).toHaveLength(0);
    });

    it('加载时应该设置isLoading状态', () => {
      useCharacterStore.getState().loadCharacters('project-1');
      
      // 加载完成后isLoading应为false
      expect(useCharacterStore.getState().isLoading).toBe(false);
    });
  });

  // ==========================================
  // recordAppearance 测试
  // ==========================================
  describe('recordAppearance', () => {
    it('应该能够记录角色出场', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.recordAppearance('project-1', characterId, 'scene-1', 'main', '主要出场');

      const character = useCharacterStore.getState().characters[0];
      expect(character.appearances).toHaveLength(1);
      expect(character.appearances[0]).toEqual({
        sceneId: 'scene-1',
        role: 'main',
        notes: '主要出场',
      });
    });

    it('同一场景重复记录应该更新而不是添加', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '测试角色',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.recordAppearance('project-1', characterId, 'scene-1', 'main', '第一次');
      store.recordAppearance('project-1', characterId, 'scene-1', 'supporting', '更新后');

      const character = useCharacterStore.getState().characters[0];
      expect(character.appearances).toHaveLength(1);
      expect(character.appearances[0].role).toBe('supporting');
      expect(character.appearances[0].notes).toBe('更新后');
    });
  });

  // ==========================================
  // setCurrentCharacter 测试
  // ==========================================
  describe('setCurrentCharacter', () => {
    it('应该能够设置当前角色ID', () => {
      useCharacterStore.getState().setCurrentCharacter('char-123');
      expect(useCharacterStore.getState().currentCharacterId).toBe('char-123');
    });

    it('应该能够清除当前角色ID', () => {
      useCharacterStore.getState().setCurrentCharacter('char-123');
      useCharacterStore.getState().setCurrentCharacter(null);
      expect(useCharacterStore.getState().currentCharacterId).toBeNull();
    });
  });

  // ==========================================
  // P0-1: 角色主题色扩展测试（primaryColor + secondaryColor）
  // ==========================================
  describe('角色主题色扩展', () => {
    it('应该能够存储角色主色(primaryColor)', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '主色测试角色',
        appearance: '红发青年',
        personality: '热情奔放',
        background: '消防员',
        primaryColor: '#FF4500',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.primaryColor).toBe('#FF4500');
    });

    it('应该能够存储角色辅色(secondaryColor)', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '辅色测试角色',
        appearance: '蓝发少女',
        personality: '冷静沉稳',
        background: '学生',
        secondaryColor: '#4169E1',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.secondaryColor).toBe('#4169E1');
    });

    it('应该能够同时存储主色和辅色', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '双色测试角色',
        appearance: '金发碧眼',
        personality: '高贵优雅',
        background: '贵族',
        primaryColor: '#FFD700',
        secondaryColor: '#191970',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.primaryColor).toBe('#FFD700');
      expect(character.secondaryColor).toBe('#191970');
    });

    it('主色和辅色应该都是可选字段', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '无色彩角色',
        appearance: '普通青年',
        personality: '普通',
        background: '路人',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.primaryColor).toBeUndefined();
      expect(character.secondaryColor).toBeUndefined();
    });

    it('更新时应该能够单独更新主色', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '更新主色测试',
        appearance: '',
        personality: '',
        background: '',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.updateCharacter('project-1', characterId, {
        primaryColor: '#00FF00',
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.primaryColor).toBe('#00FF00');
      expect(character.secondaryColor).toBeUndefined();
    });

    it('更新时应该能够单独更新辅色', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '更新辅色测试',
        appearance: '',
        personality: '',
        background: '',
        primaryColor: '#FF0000',
        relationships: [],
        appearances: [],
      });

      const characterId = useCharacterStore.getState().characters[0].id;

      store.updateCharacter('project-1', characterId, {
        secondaryColor: '#0000FF',
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.primaryColor).toBe('#FF0000');
      expect(character.secondaryColor).toBe('#0000FF');
    });

    it('主色辅色应该持久化到localStorage', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '持久化测试',
        appearance: '',
        personality: '',
        background: '',
        primaryColor: '#123456',
        secondaryColor: '#654321',
        relationships: [],
        appearances: [],
      });

      const savedData = JSON.parse(mockLocalStorage.store['aixs_characters_project-1']);
      expect(savedData[0].primaryColor).toBe('#123456');
      expect(savedData[0].secondaryColor).toBe('#654321');
    });

    it('旧版themeColor字段应该保持兼容', () => {
      const store = useCharacterStore.getState();
      
      store.addCharacter('project-1', {
        projectId: 'project-1',
        name: '兼容性测试',
        appearance: '',
        personality: '',
        background: '',
        themeColor: '#6366f1',
        primaryColor: '#FF0000',
        relationships: [],
        appearances: [],
      });

      const character = useCharacterStore.getState().characters[0];
      expect(character.themeColor).toBe('#6366f1');
      expect(character.primaryColor).toBe('#FF0000');
    });
  });
});
