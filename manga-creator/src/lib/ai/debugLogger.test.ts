import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  logAICall,
  updateLogWithResponse,
  updateLogWithError,
  updateLogProgress,
  getLogHistory,
  clearLogHistory,
  exportLogs,
  printLogSummary,
  getCallStatsByType,
  getRecentErrors,
  getOptimizationSuggestions,
  setDebugEnabled,
  isDebugEnabled,
  setProgressTrackingEnabled,
  isProgressTrackingEnabled,
  subscribeToAIEvents,
  type AICallType,
  type AICallLogEntry,
} from './debugLogger';

describe('debugLogger', () => {
  beforeEach(() => {
    clearLogHistory();
    setDebugEnabled(false); // 禁用控制台输出
    vi.clearAllMocks();
  });

  afterEach(() => {
    setDebugEnabled(true); // 恢复默认状态
  });

  describe('logAICall', () => {
    it('应该创建日志条目并返回ID', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '测试模板',
        filledPrompt: '填充后的提示词',
        messages: [{ role: 'user', content: '测试消息' }],
        context: { projectId: 'proj-1' },
        config: { provider: 'kimi', model: 'moonshot-v1' },
      });

      expect(logId).toBeDefined();
      expect(logId).toMatch(/^log_/);
    });

    it('应该正确存储日志条目', () => {
      const logId = logAICall('keyframe_prompt', {
        promptTemplate: '模板',
        filledPrompt: '填充内容',
        messages: [{ role: 'user', content: '消息' }],
        context: { projectId: 'proj-1', sceneId: 'scene-1' },
        config: { provider: 'openai', model: 'gpt-4' },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry).toBeDefined();
      expect(entry?.callType).toBe('keyframe_prompt');
      expect(entry?.status).toBe('pending');
      expect(entry?.context.projectId).toBe('proj-1');
    });

    it('应该设置正确的时间戳', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.timestamp).toBeDefined();
      expect(typeof entry?.timestamp).toBe('string');
    });

    it('应该支持所有AI调用类型', () => {
      const types: AICallType[] = [
        'scene_list_generation',
        'scene_description',
        'action_description',
        'shot_prompt',
        'keyframe_prompt',
        'motion_prompt',
        'dialogue',
        'character_basic_info',
        'character_portrait',
        'custom',
      ];

      types.forEach(type => {
        const logId = logAICall(type, {
          promptTemplate: '模板',
          filledPrompt: '内容',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });

        const history = getLogHistory();
        const entry = history.find(e => e.id === logId);
        expect(entry?.callType).toBe(type);
      });
    });

    it('应该存储完整的上下文信息', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {
          projectId: 'proj-1',
          projectTitle: '测试项目',
          style: '赛博朋克',
          protagonist: '主角',
          summary: '故事梗概',
          sceneId: 'scene-1',
          sceneOrder: 3,
          sceneSummary: '分镜概要',
          prevSceneSummary: '前一分镜',
          customField: '自定义字段',
        },
        config: { provider: 'test', model: 'test', maxTokens: 4000 },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.context.projectId).toBe('proj-1');
      expect(entry?.context.style).toBe('赛博朋克');
      expect(entry?.context.sceneOrder).toBe(3);
      expect(entry?.context.customField).toBe('自定义字段');
    });

    it('应该限制日志历史长度', () => {
      // 创建超过限制的日志条目
      for (let i = 0; i < 150; i++) {
        logAICall('scene_description', {
          promptTemplate: `模板 ${i}`,
          filledPrompt: `内容 ${i}`,
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
      }

      const history = getLogHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('updateLogWithResponse', () => {
    it('应该更新日志条目的响应信息', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogWithResponse(logId, {
        content: 'AI响应内容',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.status).toBe('success');
      expect(entry?.response?.content).toBe('AI响应内容');
      expect(entry?.response?.tokenUsage?.total).toBe(150);
    });

    it('应该在没有tokenUsage时也能正常更新', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogWithResponse(logId, {
        content: '仅内容响应',
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.status).toBe('success');
      expect(entry?.response?.content).toBe('仅内容响应');
      expect(entry?.response?.tokenUsage).toBeUndefined();
    });

    it('应该处理不存在的日志ID', () => {
      // 不应该抛出错误
      expect(() => {
        updateLogWithResponse('non-existent-id', { content: '内容' });
      }).not.toThrow();
    });
  });

  describe('updateLogWithError', () => {
    it('应该更新日志条目为错误状态', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogWithError(logId, '网络请求失败');

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.status).toBe('error');
      expect(entry?.error).toBe('网络请求失败');
    });

    it('应该处理不存在的日志ID', () => {
      expect(() => {
        updateLogWithError('non-existent-id', '错误');
      }).not.toThrow();
    });
  });

  describe('updateLogProgress', () => {
    it('应该触发进度事件', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:progress', callback);

      const logId = logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogProgress(logId, 50, '处理中...');

      expect(callback).toHaveBeenCalledWith(
        expect.any(Object),
        { progress: 50, step: '处理中...' }
      );

      unsubscribe();
    });
  });

  describe('getLogHistory', () => {
    it('应该返回日志历史的副本', () => {
      logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const history1 = getLogHistory();
      const history2 = getLogHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    it('应该按添加顺序返回日志', () => {
      logAICall('scene_description', {
        skillName: 'skill-1',
        promptTemplate: '模板1',
        filledPrompt: '内容1',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      logAICall('keyframe_prompt', {
        skillName: 'skill-2',
        promptTemplate: '模板2',
        filledPrompt: '内容2',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const history = getLogHistory();
      expect(history[0].callType).toBe('scene_description');
      expect(history[1].callType).toBe('keyframe_prompt');
    });
  });

  describe('clearLogHistory', () => {
    it('应该清空所有日志', () => {
      for (let i = 0; i < 5; i++) {
        logAICall('scene_description', {
          promptTemplate: '模板',
          filledPrompt: '内容',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
      }

      expect(getLogHistory().length).toBe(5);

      clearLogHistory();

      expect(getLogHistory().length).toBe(0);
    });
  });

  describe('exportLogs', () => {
    it('应该导出日志为JSON字符串', () => {
      logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [{ role: 'user', content: '消息' }],
        context: { projectId: 'proj-1' },
        config: { provider: 'test', model: 'test' },
      });

      const exported = exportLogs();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].callType).toBe('scene_description');
    });

    it('应该导出格式化的JSON', () => {
      logAICall('scene_description', {
        promptTemplate: '模板',
        filledPrompt: '内容',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const exported = exportLogs();
      expect(exported).toContain('\n'); // 格式化的JSON包含换行
    });
  });

  describe('getCallStatsByType', () => {
    it('应该按类型统计调用', () => {
      // 添加一些成功和失败的日志
      const id1 = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });
      updateLogWithResponse(id1, { content: '成功' });

      const id2 = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });
      updateLogWithError(id2, '失败');

      const id3 = logAICall('keyframe_prompt', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });
      updateLogWithResponse(id3, { content: '成功' });

      const stats = getCallStatsByType();

      expect(stats.scene_description.total).toBe(2);
      expect(stats.scene_description.success).toBe(1);
      expect(stats.scene_description.error).toBe(1);
      expect(stats.keyframe_prompt.total).toBe(1);
      expect(stats.keyframe_prompt.success).toBe(1);
    });

    it('应该返回空对象当没有日志时', () => {
      const stats = getCallStatsByType();
      expect(Object.keys(stats).length).toBe(0);
    });
  });

  describe('getRecentErrors', () => {
    it('应该返回最近的错误', () => {
      for (let i = 0; i < 15; i++) {
        const id = logAICall('scene_description', {
          promptTemplate: '',
          filledPrompt: '',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
        if (i % 2 === 0) {
          updateLogWithError(id, `错误 ${i}`);
        } else {
          updateLogWithResponse(id, { content: '成功' });
        }
      }

      const errors = getRecentErrors(5);
      expect(errors.length).toBe(5);
      errors.forEach(e => expect(e.status).toBe('error'));
    });

    it('应该返回空数组当没有错误时', () => {
      const id = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });
      updateLogWithResponse(id, { content: '成功' });

      const errors = getRecentErrors();
      expect(errors.length).toBe(0);
    });

    it('应该默认返回最多10条错误', () => {
      for (let i = 0; i < 20; i++) {
        const id = logAICall('scene_description', {
          promptTemplate: '',
          filledPrompt: '',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
        updateLogWithError(id, `错误 ${i}`);
      }

      const errors = getRecentErrors();
      expect(errors.length).toBe(10);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('应该在无问题时返回正面建议', () => {
      const suggestions = getOptimizationSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('✅');
    });

    it('应该在错误率高时给出警告', () => {
      // 创建高错误率的场景
      for (let i = 0; i < 10; i++) {
        const id = logAICall('scene_description', {
          promptTemplate: '',
          filledPrompt: '',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
        if (i < 4) {
          updateLogWithError(id, '错误');
        } else {
          updateLogWithResponse(id, { content: '成功' });
        }
      }

      const suggestions = getOptimizationSuggestions();
      const hasWarning = suggestions.some(s => s.includes('⚠️') || s.includes('错误率'));
      expect(hasWarning).toBe(true);
    });

    it('应该在高Token消耗时给出建议', () => {
      for (let i = 0; i < 5; i++) {
        const id = logAICall('scene_description', {
          promptTemplate: '',
          filledPrompt: '',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
        updateLogWithResponse(id, {
          content: '成功',
          tokenUsage: { prompt: 2000, completion: 500, total: 2500 },
        });
      }

      const suggestions = getOptimizationSuggestions();
      const hasTokenWarning = suggestions.some(s => s.includes('Token') || s.includes('💡'));
      expect(hasTokenWarning).toBe(true);
    });
  });

  describe('调试模式控制', () => {
    it('应该能够启用/禁用调试模式', () => {
      setDebugEnabled(true);
      expect(isDebugEnabled()).toBe(true);

      setDebugEnabled(false);
      expect(isDebugEnabled()).toBe(false);
    });
  });

  describe('进度追踪控制', () => {
    it('应该能够启用/禁用进度追踪', () => {
      setProgressTrackingEnabled(true);
      expect(isProgressTrackingEnabled()).toBe(true);

      setProgressTrackingEnabled(false);
      expect(isProgressTrackingEnabled()).toBe(false);
    });
  });

  describe('事件订阅系统', () => {
    it('应该能够订阅事件', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:start', callback);

      logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      expect(callback).toHaveBeenCalled();
      unsubscribe();
    });

    it('应该能够取消订阅', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:start', callback);

      unsubscribe();

      logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('应该触发成功事件', () => {
      const callback = vi.fn();
      subscribeToAIEvents('call:success', callback);

      const id = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogWithResponse(id, { content: '成功' });

      expect(callback).toHaveBeenCalled();
    });

    it('应该触发错误事件', () => {
      const callback = vi.fn();
      subscribeToAIEvents('call:error', callback);

      const id = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      updateLogWithError(id, '错误');

      expect(callback).toHaveBeenCalled();
    });

    it('应该能够有多个监听器', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      subscribeToAIEvents('call:start', callback1);
      subscribeToAIEvents('call:start', callback2);

      logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('应该处理回调中的错误', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('回调错误');
      });
      const normalCallback = vi.fn();

      subscribeToAIEvents('call:start', errorCallback);
      subscribeToAIEvents('call:start', normalCallback);

      // 不应该抛出错误
      expect(() => {
        logAICall('scene_description', {
          promptTemplate: '',
          filledPrompt: '',
          messages: [],
          context: {},
          config: { provider: 'test', model: 'test' },
        });
      }).not.toThrow();

      // 其他回调应该继续执行
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('边界情况', () => {
    it('应该处理空消息数组', () => {
      const logId = logAICall('scene_description', {
        promptTemplate: '',
        filledPrompt: '',
        messages: [],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);
      expect(entry?.messages).toEqual([]);
    });

    it('应该处理非常长的提示词', () => {
      const longPrompt = 'x'.repeat(100000);
      
      const logId = logAICall('scene_description', {
        promptTemplate: longPrompt,
        filledPrompt: longPrompt,
        messages: [{ role: 'user', content: longPrompt }],
        context: {},
        config: { provider: 'test', model: 'test' },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);
      expect(entry?.promptTemplate.length).toBe(100000);
    });

    it('应该处理特殊字符', () => {
      const specialContent = '测试 <script>alert("XSS")</script> 特殊字符 \n\t\r';
      
      const logId = logAICall('scene_description', {
        promptTemplate: specialContent,
        filledPrompt: specialContent,
        messages: [{ role: 'user', content: specialContent }],
        context: { special: specialContent },
        config: { provider: 'test', model: 'test' },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);
      expect(entry?.promptTemplate).toBe(specialContent);
    });

    it('应该正确处理并发添加日志', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(
          logAICall('scene_description', {
            promptTemplate: `模板 ${i}`,
            filledPrompt: `内容 ${i}`,
            messages: [],
            context: { index: i },
            config: { provider: 'test', model: 'test' },
          })
        )
      );

      await Promise.all(promises);

      const history = getLogHistory();
      expect(history.length).toBe(50);
    });
  });
});
