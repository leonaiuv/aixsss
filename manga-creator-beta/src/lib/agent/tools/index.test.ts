import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProjectTool,
  getProjectStateTool,
  setProjectInfoTool,
  generateScenesTool,
  refineSceneTool,
  batchRefineScenesTool,
  exportPromptsTool,
  resetCurrentProjectId,
} from './index';
import { getMemoryCheckpointStore, createMemoryCheckpointStore } from '@/lib/checkpoint/store';

// Mock AI 服务
vi.mock('../services/ai-service', () => ({
  generateScenesWithAI: vi.fn(),
  refineSceneWithAI: vi.fn(),
  batchRefineWithAI: vi.fn(),
  formatExportData: vi.fn((data, format) => JSON.stringify(data)),
}));

// Mock checkpoint store
vi.mock('@/lib/checkpoint/store', async () => {
  const actual = await vi.importActual('@/lib/checkpoint/store');
  return {
    ...actual,
    getMemoryCheckpointStore: vi.fn(),
  };
});

describe('Agent Tools', () => {
  let mockStore: ReturnType<typeof createMemoryCheckpointStore>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    resetCurrentProjectId();
    mockStore = createMemoryCheckpointStore();
    vi.mocked(getMemoryCheckpointStore).mockReturnValue(mockStore);
  });

  describe('createProjectTool', () => {
    it('应该创建新项目并保存到 checkpoint', async () => {
      const result = await createProjectTool.execute({ title: '测试项目' }, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.data?.projectId).toBeDefined();
      expect(result.data?.title).toBe('测试项目');
      
      // 验证 checkpoint 已保存
      const projects = await mockStore.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].title).toBe('测试项目');
      expect(projects[0].workflowState).toBe('COLLECTING_BASIC_INFO');
    });
  });

  describe('getProjectStateTool', () => {
    it('应该返回项目状态', async () => {
      // 先创建项目
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      
      const result = await getProjectStateTool.execute({}, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('测试项目');
    });

    it('应该在无项目时返回错误', async () => {
      const result = await getProjectStateTool.execute({}, {} as never);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('未指定项目');
    });
  });

  describe('setProjectInfoTool', () => {
    it('应该更新项目信息', async () => {
      // 先创建项目
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      
      const result = await setProjectInfoTool.execute({
        summary: '测试故事简介',
        artStyle: '赛博朋克风格',
        protagonist: '主角小明',
      }, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('summary');
      
      // 验证状态已更新
      const stateResult = await getProjectStateTool.execute({}, {} as never);
      expect(stateResult.data?.summary).toBe('测试故事简介');
    });

    it('应该在基础信息完整时更新工作流状态', async () => {
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      
      await setProjectInfoTool.execute({
        summary: '测试故事简介',
        artStyle: '赛博朋克风格',
        protagonist: '主角小明',
      }, {} as never);
      
      const stateResult = await getProjectStateTool.execute({}, {} as never);
      expect(stateResult.data?.workflowState).toBe('BASIC_INFO_COMPLETE');
    });
  });

  describe('generateScenesTool', () => {
    it('应该调用 AI 生成分镜', async () => {
      const { generateScenesWithAI } = await import('../services/ai-service');
      
      // 创建并配置项目
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      await setProjectInfoTool.execute({
        summary: '测试故事',
        artStyle: '赛博朋克',
        protagonist: '主角',
      }, {} as never);
      
      // Mock AI 响应
      vi.mocked(generateScenesWithAI).mockResolvedValue({
        success: true,
        data: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
            { id: 'scene-2', order: 2, summary: '分镜2', status: 'pending' },
          ],
        },
      });
      
      const result = await generateScenesTool.execute({ count: 6 }, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.data?.scenes).toHaveLength(2);
      expect(generateScenesWithAI).toHaveBeenCalled();
    });

    it('应该在基础信息不完整时返回错误', async () => {
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      
      const result = await generateScenesTool.execute({ count: 6 }, {} as never);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('基础信息');
    });
  });

  describe('refineSceneTool', () => {
    it('应该调用 AI 细化分镜', async () => {
      const { generateScenesWithAI, refineSceneWithAI } = await import('../services/ai-service');
      
      // 创建并配置项目
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      await setProjectInfoTool.execute({
        summary: '测试故事',
        artStyle: '赛博朋克',
        protagonist: '主角',
      }, {} as never);
      
      // Mock AI 生成分镜
      vi.mocked(generateScenesWithAI).mockResolvedValue({
        success: true,
        data: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
          ],
        },
      });
      
      await generateScenesTool.execute({ count: 6 }, {} as never);
      
      // Mock AI 细化响应
      vi.mocked(refineSceneWithAI).mockResolvedValue({
        success: true,
        data: {
          sceneId: 'scene-1',
          sceneDescription: '详细场景描述',
          keyframePrompt: 'keyframe prompt',
          spatialPrompt: 'spatial prompt',
          fullPrompt: '赛博朋克, keyframe prompt',
          status: 'completed',
        },
      });
      
      const result = await refineSceneTool.execute({ sceneId: 'scene-1' }, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.data?.sceneDescription).toBe('详细场景描述');
      expect(result.data?.fullPrompt).toContain('赛博朋克');
    });
  });

  describe('exportPromptsTool', () => {
    it('应该导出已完成分镜的提示词', async () => {
      const { generateScenesWithAI, refineSceneWithAI } = await import('../services/ai-service');
      
      // 创建并配置完整项目
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      await setProjectInfoTool.execute({
        summary: '测试故事',
        artStyle: '赛博朋克',
        protagonist: '主角',
      }, {} as never);
      
      // Mock 生成和细化
      vi.mocked(generateScenesWithAI).mockResolvedValue({
        success: true,
        data: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
          ],
        },
      });
      
      await generateScenesTool.execute({ count: 6 }, {} as never);
      
      vi.mocked(refineSceneWithAI).mockResolvedValue({
        success: true,
        data: {
          sceneId: 'scene-1',
          sceneDescription: '详细场景描述',
          keyframePrompt: 'keyframe prompt',
          spatialPrompt: 'spatial prompt',
          fullPrompt: '赛博朋克, keyframe prompt',
          status: 'completed',
        },
      });
      
      await refineSceneTool.execute({ sceneId: 'scene-1' }, {} as never);
      
      const result = await exportPromptsTool.execute({ format: 'json' }, {} as never);
      
      expect(result.success).toBe(true);
      expect(result.data?.format).toBe('json');
      expect(result.data?.scenesCount).toBe(1);
    });

    it('应该在无完成分镜时返回错误', async () => {
      const { generateScenesWithAI } = await import('../services/ai-service');
      
      await createProjectTool.execute({ title: '测试项目' }, {} as never);
      await setProjectInfoTool.execute({
        summary: '测试故事',
        artStyle: '赛博朋克',
        protagonist: '主角',
      }, {} as never);
      
      vi.mocked(generateScenesWithAI).mockResolvedValue({
        success: true,
        data: {
          scenes: [
            { id: 'scene-1', order: 1, summary: '分镜1', status: 'pending' },
          ],
        },
      });
      
      await generateScenesTool.execute({ count: 6 }, {} as never);
      
      const result = await exportPromptsTool.execute({ format: 'json' }, {} as never);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('没有已完成的分镜');
    });
  });
});
