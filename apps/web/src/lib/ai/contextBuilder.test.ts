import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildCharacterContext,
  buildStyleContext,
  buildWorldViewContext,
  buildFullContext,
  fillPromptTemplate,
  ContextBuildOptions,
} from './contextBuilder';
import { Character, ArtStyleConfig, WorldViewElement } from '@/types';

// ==========================================
// P0-3: 上下文注入机制测试
// ==========================================

describe('上下文构建器', () => {
  // 测试数据
  const mockCharacters: Character[] = [
    {
      id: 'char-1',
      projectId: 'proj-1',
      name: '李明',
      appearance: '20岁青年，黑发短发，身穿白色衬衫',
      personality: '开朗、正义感强、勇敢',
      background: '普通大学生',
      primaryColor: '#FF4500',
      secondaryColor: '#FFD700',
      relationships: [],
      appearances: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    {
      id: 'char-2',
      projectId: 'proj-1',
      name: '小红',
      appearance: '18岁少女，长发飘飘，穿着校服',
      personality: '温柔、聪明、善解人意',
      background: '高中生',
      primaryColor: '#FF69B4',
      relationships: [],
      appearances: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
  ];

  const mockArtStyle: ArtStyleConfig = {
    presetId: 'anime_cel',
    baseStyle: 'anime style, cel shaded, clean lineart',
    technique: 'flat color blocking, sharp outlines',
    colorPalette: 'vibrant saturated colors',
    culturalFeature: 'Japanese animation aesthetics',
    fullPrompt:
      'anime style, cel shaded, clean lineart, flat color blocking, sharp outlines, vibrant saturated colors, Japanese animation aesthetics',
  };

  const mockWorldViewElements: WorldViewElement[] = [
    {
      id: 'wv-1',
      projectId: 'proj-1',
      type: 'era',
      title: '现代都市',
      content: '故事发生在2024年的现代都市，高楼林立，科技发达',
      order: 1,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    {
      id: 'wv-2',
      projectId: 'proj-1',
      type: 'geography',
      title: '滨海城市',
      content: '城市临海而建，有美丽的海滩和港口',
      order: 2,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
  ];

  describe('buildCharacterContext', () => {
    it('应该正确构建单个角色的上下文', () => {
      const context = buildCharacterContext([mockCharacters[0]]);

      expect(context).toContain('李明');
      expect(context).toContain('20岁青年');
      expect(context).toContain('开朗');
      expect(context).toContain('#FF4500');
    });

    it('应该正确构建多个角色的上下文', () => {
      const context = buildCharacterContext(mockCharacters);

      expect(context).toContain('李明');
      expect(context).toContain('小红');
    });

    it('没有角色时应返回空字符串', () => {
      const context = buildCharacterContext([]);
      expect(context).toBe('');
    });

    it('应该包含角色的外貌和性格', () => {
      const context = buildCharacterContext([mockCharacters[0]]);

      expect(context).toContain('外貌');
      expect(context).toContain('性格');
      expect(context).toContain('黑发短发');
      expect(context).toContain('正义感强');
    });

    it('应该包含角色的主色和辅色（如果存在）', () => {
      const context = buildCharacterContext([mockCharacters[0]]);

      expect(context).toContain('主色');
      expect(context).toContain('#FF4500');
      expect(context).toContain('辅色');
      expect(context).toContain('#FFD700');
    });

    it('没有色彩时不应输出色彩信息', () => {
      const charWithoutColor: Character = {
        ...mockCharacters[0],
        primaryColor: undefined,
        secondaryColor: undefined,
      };
      const context = buildCharacterContext([charWithoutColor]);

      expect(context).not.toContain('主色');
      expect(context).not.toContain('辅色');
    });
  });

  describe('buildStyleContext', () => {
    it('应该正确构建画风上下文', () => {
      const context = buildStyleContext(mockArtStyle);

      expect(context).toContain('anime style');
      expect(context).toContain('cel shaded');
    });

    it('没有画风配置时应返回空字符串', () => {
      const context = buildStyleContext(undefined);
      expect(context).toBe('');
    });

    it('应该使用完整的fullPrompt', () => {
      const context = buildStyleContext(mockArtStyle);
      expect(context).toContain(mockArtStyle.fullPrompt);
    });
  });

  describe('buildWorldViewContext', () => {
    it('应该正确构建世界观上下文', () => {
      const context = buildWorldViewContext(mockWorldViewElements);

      expect(context).toContain('现代都市');
      expect(context).toContain('2024年');
      expect(context).toContain('滨海城市');
    });

    it('没有世界观要素时应返回空字符串', () => {
      const context = buildWorldViewContext([]);
      expect(context).toBe('');
    });

    it('应该按类型分组显示', () => {
      const context = buildWorldViewContext(mockWorldViewElements);

      expect(context).toContain('时代背景');
      expect(context).toContain('地理设定');
    });
  });

  describe('buildFullContext', () => {
    it('应该整合所有上下文信息', () => {
      const options: ContextBuildOptions = {
        characters: mockCharacters,
        artStyle: mockArtStyle,
        worldViewElements: mockWorldViewElements,
      };

      const context = buildFullContext(options);

      expect(context).toContain('李明');
      expect(context).toContain('anime style');
      expect(context).toContain('现代都市');
    });

    it('应该正确处理部分信息缺失的情况', () => {
      const options: ContextBuildOptions = {
        characters: mockCharacters,
        artStyle: undefined,
        worldViewElements: [],
      };

      const context = buildFullContext(options);

      expect(context).toContain('李明');
      expect(context).not.toContain('anime style');
    });

    it('所有信息都缺失时应返回空字符串', () => {
      const options: ContextBuildOptions = {
        characters: [],
        artStyle: undefined,
        worldViewElements: [],
      };

      const context = buildFullContext(options);
      expect(context).toBe('');
    });
  });

  describe('fillPromptTemplate', () => {
    it('应该正确填充模板变量', () => {
      const template = '角色: {characters}\n画风: {style}\n世界观: {worldview}';
      const options: ContextBuildOptions = {
        characters: mockCharacters,
        artStyle: mockArtStyle,
        worldViewElements: mockWorldViewElements,
      };

      const filled = fillPromptTemplate(template, options);

      expect(filled).toContain('李明');
      expect(filled).toContain('anime style');
      expect(filled).toContain('现代都市');
    });

    it('应该正确填充现有的模板变量', () => {
      const template = '视觉风格: {style}\n主角特征: {protagonist}';
      const options: ContextBuildOptions = {
        characters: mockCharacters,
        artStyle: mockArtStyle,
        worldViewElements: [],
        protagonist: '李明是一个勇敢的青年',
      };

      const filled = fillPromptTemplate(template, options);

      expect(filled).toContain('anime style');
      expect(filled).toContain('李明是一个勇敢的青年');
    });

    it('未提供的变量应保持原样或替换为空', () => {
      const template = '画风: {style}\n缺失: {missing}';
      const options: ContextBuildOptions = {
        characters: [],
        artStyle: mockArtStyle,
        worldViewElements: [],
      };

      const filled = fillPromptTemplate(template, options);

      expect(filled).toContain('anime style');
      // 未知变量应保持原样
      expect(filled).toContain('{missing}');
    });

    it('应该正确处理场景相关变量', () => {
      const template = '场景: {scene_description}\n概要: {scene_summary}';
      const options: ContextBuildOptions = {
        characters: [],
        artStyle: undefined,
        worldViewElements: [],
        sceneDescription: '阳光明媚的校园操场',
        sceneSummary: '主角在操场上奔跑',
      };

      const filled = fillPromptTemplate(template, options);

      expect(filled).toContain('阳光明媚的校园操场');
      expect(filled).toContain('主角在操场上奔跑');
    });
  });

  describe('上下文长度控制', () => {
    it('角色数量过多时应该进行摘要', () => {
      // 创建10个角色
      const manyCharacters: Character[] = Array.from({ length: 10 }, (_, i) => ({
        ...mockCharacters[0],
        id: `char-${i}`,
        name: `角色${i}`,
      }));

      const context = buildCharacterContext(manyCharacters, { maxLength: 500 });

      // 应该有长度限制
      expect(context.length).toBeLessThanOrEqual(600); // 允许一些溢出
    });
  });
});
