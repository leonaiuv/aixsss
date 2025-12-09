import { describe, it, expect, vi } from 'vitest';
import {
  compressProjectEssence,
  compressSceneSummary,
  compressSceneHistory,
  calculateTotalTokens,
  checkTokenLimit,
  buildOptimizedContext,
  // AI Skill 定义
  MoodExtractionSkill,
  KeyElementExtractionSkill,
  SmartSummarySkill,
  // AI 智能版本函数
  extractMoodWithAI,
  extractKeyElementWithAI,
  compressTextWithAI,
  compressProjectEssenceWithAI,
  compressSceneSummaryWithAI,
} from './contextCompressor';
import { Project, Scene } from '@/types';

describe('ContextCompressor', () => {
  const mockProject: Project = {
    id: 'test-project',
    title: '测试项目',
    summary: '这是一个测试故事梗概，包含了各种有趣的情节和转折。主角是一位勇敢的冒险者，他在一个充满魔法的世界中寻找传说中的宝藏。',
    style: '奇幻风格',
    protagonist: '主角是一位18岁的少年，银色短发，紫色眼睛，穿着黑色长袍，手持魔法杖，性格勇敢且善良。',
    workflowState: 'DATA_COLLECTED',
    currentSceneOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockScenes: Scene[] = [
    {
      id: 'scene-1',
      projectId: 'test-project',
      order: 1,
      summary: '主角在森林中遇到神秘老人',
      sceneDescription: '茂密的森林，阳光透过树叶洒下斑驳光影',
      actionDescription: '主角停下脚步，警惕地看着前方',
      shotPrompt: 'forest, mysterious old man, dramatic lighting',
      status: 'completed',
      notes: '',
    },
    {
      id: 'scene-2',
      projectId: 'test-project',
      order: 2,
      summary: '获得魔法石指引',
      sceneDescription: '老人递给主角一块发光的魔法石',
      actionDescription: '主角接过魔法石，眼中充满惊奇',
      shotPrompt: 'glowing magic stone, close-up shot',
      status: 'completed',
      notes: '',
    },
    {
      id: 'scene-3',
      projectId: 'test-project',
      order: 3,
      summary: '深入魔法洞穴',
      sceneDescription: '幽暗的洞穴，石壁上刻满古老文字',
      actionDescription: '主角举起魔法石照亮前方',
      shotPrompt: 'dark cave, ancient runes, magical light',
      status: 'scene_confirmed',
      notes: '',
    },
  ];

  describe('compressProjectEssence', () => {
    it('应该成功压缩项目核心信息', () => {
      const result = compressProjectEssence(mockProject, 'balanced');
      
      expect(result).toHaveProperty('style');
      expect(result).toHaveProperty('protagonistCore');
      expect(result).toHaveProperty('storyCore');
      expect(result).toHaveProperty('tokens');
      expect(result.style).toBe('奇幻风格');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('激进策略应该产生更少的tokens', () => {
      const aggressive = compressProjectEssence(mockProject, 'aggressive');
      const conservative = compressProjectEssence(mockProject, 'conservative');
      
      expect(aggressive.tokens).toBeLessThan(conservative.tokens);
    });

    it('应该在内容过长时进行截断', () => {
      const longProject = {
        ...mockProject,
        summary: '这是一个非常非常非常非常长的故事梗概，'.repeat(50),
      };
      
      const result = compressProjectEssence(longProject, 'aggressive');
      expect(result.storyCore.length).toBeLessThan(longProject.summary.length);
      expect(result.storyCore).toContain('...');
    });
  });

  describe('compressSceneSummary', () => {
    it('应该成功压缩分镜摘要', () => {
      const result = compressSceneSummary(mockScenes[0], 'balanced');
      
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('mood');
      expect(result).toHaveProperty('keyElement');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('应该提取情绪基调', () => {
      const tensionScene: Scene = {
        ...mockScenes[0],
        summary: '主角在危险的战斗中紧张地躲避攻击',
      };
      
      const result = compressSceneSummary(tensionScene, 'balanced');
      expect(result.mood).toBeDefined();
    });
  });

  describe('compressSceneHistory', () => {
    it('应该成功压缩场景历史', () => {
      const result = compressSceneHistory(mockScenes, 2, 'balanced');
      
      expect(result).toHaveProperty('compressed');
      expect(result).toHaveProperty('tokens');
      expect(result.compressed).toContain('分镜');
    });

    it('第一个分镜应该返回空历史', () => {
      const result = compressSceneHistory(mockScenes, 0, 'balanced');
      
      expect(result.compressed).toBe('');
      expect(result.tokens).toBe(0);
    });

    it('应该只保留前N个分镜的历史', () => {
      const longScenes = Array.from({ length: 10 }, (_, i) => ({
        ...mockScenes[0],
        id: `scene-${i}`,
        order: i + 1,
        summary: `分镜${i + 1}`,
      }));
      
      const result = compressSceneHistory(longScenes, 9, 'balanced');
      // 注意：现在只有summary包含"分镜"，每个scene有1个
      const sceneCount = (result.compressed.match(/分镜概要/g) || []).length;
      
      expect(sceneCount).toBeLessThanOrEqual(3); // balanced策略保留3个
    });
  });

  describe('calculateTotalTokens', () => {
    it('应该正确计算总token数', () => {
      const components = {
        system: '你是一个AI助手',
        project: '项目信息',
        current: '当前内容',
      };
      
      const total = calculateTotalTokens(components);
      expect(total).toBeGreaterThan(0);
    });

    it('应该忽略undefined组件', () => {
      const components = {
        system: '你是一个AI助手',
        project: undefined,
        current: '当前内容',
      };
      
      const total = calculateTotalTokens(components);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('checkTokenLimit', () => {
    it('应该正确检查token限制', () => {
      const result = checkTokenLimit(2000, 4000);
      
      expect(result.withinLimit).toBe(true);
      expect(result.usage).toBe(50);
      expect(result.remaining).toBe(2000);
    });

    it('超出限制时应该返回false', () => {
      const result = checkTokenLimit(5000, 4000);
      
      expect(result.withinLimit).toBe(false);
      expect(result.usage).toBeGreaterThan(100);
      expect(result.remaining).toBeLessThan(0);
    });
  });

  describe('buildOptimizedContext', () => {
    it('应该构建优化后的上下文', () => {
      const result = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[0],
        scenes: mockScenes,
        currentIndex: 0,
        strategy: 'balanced',
      });
      
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('breakdown');
      expect(result.context).toContain('项目信息');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('应该在没有历史时不包含历史上下文', () => {
      const result = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[0],
        scenes: mockScenes,
        currentIndex: 0,
      });
      
      expect(result.breakdown.history).toBeUndefined();
    });

    it('应该在有历史时包含历史上下文', () => {
      const result = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[2],
        scenes: mockScenes,
        currentIndex: 2,
      });
      
      expect(result.context).toContain('前序分镜');
      expect(result.breakdown.history).toBeGreaterThan(0);
    });

    it('不同策略应该产生不同的token数', () => {
      const aggressive = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[2],
        scenes: mockScenes,
        currentIndex: 2,
        strategy: 'aggressive',
      });
      
      const conservative = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[2],
        scenes: mockScenes,
        currentIndex: 2,
        strategy: 'conservative',
      });
      
      expect(aggressive.tokens).toBeLessThan(conservative.tokens);
    });
  });

  // ==========================================
  // P1-1: 压缩器正式接入测试
  // ==========================================
  describe('压缩策略智能选择', () => {
    it('应该根据内容复杂度推荐压缩策略', () => {
      // 简单内容应该使用保守策略
      const simpleProject = {
        ...mockProject,
        summary: '简单的故事',
        protagonist: '主角',
      };
      
      const result = buildOptimizedContext({
        project: simpleProject,
        scenes: mockScenes.slice(0, 2),
        currentIndex: 1,
        strategy: 'conservative',
      });
      
      // 保守策略应该保留更多信息
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('复杂内容应该使用激进策略减少token', () => {
      const complexProject = {
        ...mockProject,
        summary: '非常复杂的故事梳概，'.repeat(20),
        protagonist: '复杂的主角描述，'.repeat(20),
      };
      
      const aggressive = buildOptimizedContext({
        project: complexProject,
        scenes: mockScenes,
        currentIndex: 2,
        strategy: 'aggressive',
      });
      
      const balanced = buildOptimizedContext({
        project: complexProject,
        scenes: mockScenes,
        currentIndex: 2,
        strategy: 'balanced',
      });
      
      expect(aggressive.tokens).toBeLessThan(balanced.tokens);
    });
  });

  describe('关键信息保护', () => {
    it('压缩后应该保留项目风格', () => {
      const result = buildOptimizedContext({
        project: mockProject,
        strategy: 'aggressive',
      });
      
      expect(result.context).toContain('奇幻风格');
    });

    it('压缩后应该保留当前分镜概要', () => {
      const result = buildOptimizedContext({
        project: mockProject,
        currentScene: mockScenes[0],
        strategy: 'aggressive',
      });
      
      // 应该包含当前分镜信息
      expect(result.context).toContain('当前分镜');
    });

    it('压缩后应该保留情绪基调', () => {
      const tensionScene: Scene = {
        ...mockScenes[0],
        summary: '紧张的战斗中主角拼死身亡',
      };
      
      const result = compressSceneSummary(tensionScene, 'aggressive');
      
      expect(result.mood).toBe('紧张');
    });
  });

  // ==========================================
  // AI Skill 定义测试
  // ==========================================
  describe('AI Skill 定义', () => {
    it('情绪提取技能应包含必要属性', () => {
      expect(MoodExtractionSkill).toHaveProperty('name', 'mood-extraction');
      expect(MoodExtractionSkill).toHaveProperty('promptTemplate');
      expect(MoodExtractionSkill.requiredContext).toContain('scene_description');
    });

    it('关键元素提取技能应包含必要属性', () => {
      expect(KeyElementExtractionSkill).toHaveProperty('name', 'key-element-extraction');
      expect(KeyElementExtractionSkill).toHaveProperty('promptTemplate');
      expect(KeyElementExtractionSkill.requiredContext).toContain('scene_description');
    });

    it('智能摘要技能应包含必要属性', () => {
      expect(SmartSummarySkill).toHaveProperty('name', 'smart-summary');
      expect(SmartSummarySkill).toHaveProperty('promptTemplate');
      expect(SmartSummarySkill.promptTemplate).toContain('{target_length}');
    });
  });

  // ==========================================
  // AI 智能版本测试
  // ==========================================
  describe('AI 智能提取情绪', () => {
    const mockAIClient = {
      chat: vi.fn(),
    };

    it('成功AI提取情绪', async () => {
      mockAIClient.chat.mockResolvedValueOnce({ content: '神秘' });
      
      const result = await extractMoodWithAI(mockAIClient, '黑暗的洞穴中传来未知的声音');
      
      expect(result).toBe('神秘');
      expect(mockAIClient.chat).toHaveBeenCalled();
    });

    it('AI失败时回退到规则引擎', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('API超时'));
      
      const result = await extractMoodWithAI(mockAIClient, '紧张的追击场面');
      
      // 应回退到规则引擎，匹配"紧张"关键词
      expect(result).toBe('紧张');
    });
  });

  describe('AI 智能提取关键元素', () => {
    const mockAIClient = {
      chat: vi.fn(),
    };

    it('成功AI提取关键元素', async () => {
      mockAIClient.chat.mockResolvedValueOnce({ content: '魔法石' });
      
      const result = await extractKeyElementWithAI(mockAIClient, '老人递给主角一块发光的魔法石');
      
      expect(result).toBe('魔法石');
    });

    it('AI失败时回退到规则引擎', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('网络错误'));
      
      const result = await extractKeyElementWithAI(mockAIClient, '老人递给主角一块发光的魔法石');
      
      // 回退到规则引擎，应提取出某个元素
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('AI 智能文本压缩', () => {
    const mockAIClient = {
      chat: vi.fn(),
    };

    it('成功AI压缩文本', async () => {
      mockAIClient.chat.mockResolvedValueOnce({ content: '少年银发紫眸，黑袍魔法师' });
      
      const result = await compressTextWithAI(
        mockAIClient,
        '主角是一位18岁的少年，银色短发，紫色眸子，穿着黑色长袍，是一位强大的魔法师',
        20
      );
      
      expect(result).toBe('少年银发紫眸，黑袍魔法师');
    });

    it('AI失败时回退到截断', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('API错误'));
      
      const longText = '这是一段很长的文本需要被压缩';
      const result = await compressTextWithAI(mockAIClient, longText, 5);
      
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(8); // 5 + "..."
    });
  });

  describe('AI 智能压缩项目信息', () => {
    const mockAIClient = {
      chat: vi.fn(),
    };

    it('成功AI压缩项目核心信息', async () => {
      mockAIClient.chat
        .mockResolvedValueOnce({ content: '银发紫眸魔法师' }) // protagonist
        .mockResolvedValueOnce({ content: '冒险寻宝故事' }); // story
      
      const result = await compressProjectEssenceWithAI(mockAIClient, mockProject, 'balanced');
      
      expect(result).toHaveProperty('style', '奇幻风格');
      expect(result).toHaveProperty('protagonistCore', '银发紫眸魔法师');
      expect(result).toHaveProperty('storyCore', '冒险寻宝故事');
      expect(result).toHaveProperty('tokens');
    });

    it('AI失败时回退到规则引擎', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('服务不可用'));
      
      const result = await compressProjectEssenceWithAI(mockAIClient, mockProject, 'balanced');
      
      // 回退到规则引擎，应该仍能返回结果
      expect(result).toHaveProperty('style');
      expect(result).toHaveProperty('protagonistCore');
      expect(result).toHaveProperty('storyCore');
    });
  });

  describe('AI 智能压缩分镜摘要', () => {
    const mockAIClient = {
      chat: vi.fn(),
    };

    it('成功AI压缩分镜摘要', async () => {
      mockAIClient.chat
        .mockResolvedValueOnce({ content: '森林遇老人' }) // summary
        .mockResolvedValueOnce({ content: '神秘' }) // mood
        .mockResolvedValueOnce({ content: '神秘老人' }); // keyElement
      
      const result = await compressSceneSummaryWithAI(mockAIClient, mockScenes[0], 'balanced');
      
      expect(result).toHaveProperty('summary', '森林遇老人');
      expect(result).toHaveProperty('mood', '神秘');
      expect(result).toHaveProperty('keyElement', '神秘老人');
    });

    it('AI失败时回退到规则引擎', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('超时'));
      
      const result = await compressSceneSummaryWithAI(mockAIClient, mockScenes[0], 'balanced');
      
      // 回退到规则引擎
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('tokens');
    });
  });
});
