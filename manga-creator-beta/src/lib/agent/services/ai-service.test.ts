import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateScenesWithAI,
  refineSceneWithAI,
  batchRefineWithAI,
  formatExportData,
  type GenerateScenesContext,
  type RefineSceneContext,
  type ExportData,
} from './ai-service';

// Mock ai 模块
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// Mock @ai-sdk/openai 模块
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    // 返回一个带有 .chat() 方法的函数
    const fn = vi.fn(() => ({})) as ReturnType<typeof vi.fn> & { chat: ReturnType<typeof vi.fn> };
    fn.chat = vi.fn(() => ({}));
    return fn;
  }),
}));

describe('AI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 设置环境变量
    process.env.DEEPSEEK_API_KEY = 'test-api-key';
  });

  describe('generateScenesWithAI', () => {
    it('应该生成指定数量的分镜', async () => {
      const { generateText } = await import('ai');
      
      const mockResponse = {
        text: JSON.stringify({
          scenes: [
            { order: 1, summary: '主角小明在城市中漫步' },
            { order: 2, summary: '遇到神秘人物' },
            { order: 3, summary: '获得超能力' },
            { order: 4, summary: '第一次使用能力' },
            { order: 5, summary: '面对首个敌人' },
            { order: 6, summary: '战胜敌人后的反思' },
          ],
        }),
      };
      
      vi.mocked(generateText).mockResolvedValue(mockResponse as never);

      const context: GenerateScenesContext = {
        title: '测试漫画',
        summary: '一个关于超能力的故事',
        artStyle: '赛博朋克风格',
        protagonist: '小明，18岁少年',
        count: 6,
      };

      const result = await generateScenesWithAI(context);

      expect(result.success).toBe(true);
      expect(result.data?.scenes).toHaveLength(6);
      expect(result.data?.scenes[0]).toHaveProperty('id');
      expect(result.data?.scenes[0]).toHaveProperty('order');
      expect(result.data?.scenes[0]).toHaveProperty('summary');
      expect(result.data?.scenes[0].status).toBe('pending');
    });

    it('应该在 AI 调用失败时返回错误', async () => {
      const { generateText } = await import('ai');
      
      vi.mocked(generateText).mockRejectedValue(new Error('API Error'));

      const context: GenerateScenesContext = {
        title: '测试',
        summary: '测试',
        artStyle: '测试',
        protagonist: '测试',
        count: 6,
      };

      const result = await generateScenesWithAI(context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理无效的 AI 响应', async () => {
      const { generateText } = await import('ai');
      
      vi.mocked(generateText).mockResolvedValue({ text: 'invalid json' } as never);

      const context: GenerateScenesContext = {
        title: '测试',
        summary: '测试',
        artStyle: '测试',
        protagonist: '测试',
        count: 6,
      };

      const result = await generateScenesWithAI(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('解析');
    });
  });

  describe('refineSceneWithAI', () => {
    it('应该细化分镜并生成完整提示词', async () => {
      const { generateText } = await import('ai');
      
      const mockResponse = {
        text: JSON.stringify({
          sceneDescription: '城市夜景，霓虹灯闪烁，主角站在高楼顶端',
          keyframePrompt: 'cyberpunk city night, neon lights, male protagonist standing on rooftop',
          spatialPrompt: 'camera slowly zooms out, revealing the vast cityscape',
        }),
      };
      
      vi.mocked(generateText).mockResolvedValue(mockResponse as never);

      const context: RefineSceneContext = {
        sceneId: 'scene-1',
        sceneSummary: '主角在城市中漫步',
        artStyle: '赛博朋克风格，霓虹色调，高对比度',
        protagonist: '小明，18岁少年，黑色风衣',
        projectTitle: '测试漫画',
      };

      const result = await refineSceneWithAI(context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('sceneDescription');
      expect(result.data).toHaveProperty('keyframePrompt');
      expect(result.data).toHaveProperty('spatialPrompt');
      expect(result.data).toHaveProperty('fullPrompt');
      // fullPrompt 应该包含画风
      expect(result.data?.fullPrompt).toContain('赛博朋克风格');
    });

    it('应该在关键帧提示词中融入画风', async () => {
      const { generateText } = await import('ai');
      
      const mockResponse = {
        text: JSON.stringify({
          sceneDescription: '测试场景',
          keyframePrompt: 'test keyframe prompt',
          spatialPrompt: 'test spatial prompt',
        }),
      };
      
      vi.mocked(generateText).mockResolvedValue(mockResponse as never);

      const context: RefineSceneContext = {
        sceneId: 'scene-1',
        sceneSummary: '测试场景',
        artStyle: '水墨画风格，淡雅色调',
        protagonist: '主角',
        projectTitle: '测试',
      };

      const result = await refineSceneWithAI(context);

      expect(result.success).toBe(true);
      // fullPrompt 应该包含画风描述
      expect(result.data?.fullPrompt).toContain('水墨画风格');
    });

    it('应该处理缺少必要字段的响应', async () => {
      const { generateText } = await import('ai');
      
      vi.mocked(generateText).mockResolvedValue({ 
        text: JSON.stringify({ sceneDescription: 'only one field' }) 
      } as never);

      const context: RefineSceneContext = {
        sceneId: 'scene-1',
        sceneSummary: '测试',
        artStyle: '测试',
        protagonist: '测试',
        projectTitle: '测试',
      };

      const result = await refineSceneWithAI(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('缺少必要字段');
    });

    it('应该处理 AI 调用失败', async () => {
      const { generateText } = await import('ai');
      
      vi.mocked(generateText).mockRejectedValue(new Error('API Error'));

      const context: RefineSceneContext = {
        sceneId: 'scene-1',
        sceneSummary: '测试',
        artStyle: '测试',
        protagonist: '测试',
        projectTitle: '测试',
      };

      const result = await refineSceneWithAI(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI 服务调用失败');
    });
  });

  describe('batchRefineWithAI', () => {
    it('应该批量细化多个分镜', async () => {
      const { generateText } = await import('ai');
      
      const mockResponse = {
        text: JSON.stringify({
          sceneDescription: '测试场景',
          keyframePrompt: 'test prompt',
          spatialPrompt: 'camera move',
        }),
      };
      
      vi.mocked(generateText).mockResolvedValue(mockResponse as never);

      const scenes = [
        { sceneId: 'scene-1', sceneSummary: '第一幕' },
        { sceneId: 'scene-2', sceneSummary: '第二幕' },
      ];

      const result = await batchRefineWithAI(scenes, {
        artStyle: '测试风格',
        protagonist: '主角',
        projectTitle: '测试项目',
      });

      expect(result.success).toBe(true);
      expect(result.data?.results).toHaveLength(2);
    });

    it('应该在所有分镜失败时返回错误', async () => {
      const { generateText } = await import('ai');
      
      vi.mocked(generateText).mockRejectedValue(new Error('API Error'));

      const scenes = [
        { sceneId: 'scene-1', sceneSummary: '第一幕' },
      ];

      const result = await batchRefineWithAI(scenes, {
        artStyle: '测试风格',
        protagonist: '主角',
        projectTitle: '测试项目',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('所有分镜细化失败');
    });
  });

  describe('formatExportData', () => {
    const testData: ExportData = {
      projectTitle: '测试漫画',
      artStyle: '日式风格',
      scenes: [
        {
          order: 1,
          summary: '第一幕',
          sceneDescription: '场景描述',
          keyframePrompt: 'keyframe',
          spatialPrompt: 'spatial',
          fullPrompt: '日式风格, keyframe',
        },
      ],
      exportedAt: '2024-01-01T00:00:00Z',
    };

    it('应该导出 JSON 格式', () => {
      const result = formatExportData(testData, 'json');
      const parsed = JSON.parse(result);
      expect(parsed.projectTitle).toBe('测试漫画');
    });

    it('应该导出 TXT 格式', () => {
      const result = formatExportData(testData, 'txt');
      expect(result).toContain('# 测试漫画');
      expect(result).toContain('画风：日式风格');
      expect(result).toContain('分镜 1');
    });

    it('应该导出 CSV 格式', () => {
      const result = formatExportData(testData, 'csv');
      expect(result).toContain('order,summary');
      expect(result).toContain('第一幕');
    });
  });
});
