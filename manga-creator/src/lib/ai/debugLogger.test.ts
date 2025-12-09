import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  logAICall,
  updateLogWithResponse,
  updateLogWithError,
  updateLogProgress,
  getLogHistory,
  clearLogHistory,
  exportLogs,
  printLogSummary,
  setDebugEnabled,
  isDebugEnabled,
  setProgressTrackingEnabled,
  isProgressTrackingEnabled,
  subscribeToAIEvents,
  getCallStatsByType,
  getRecentErrors,
  getOptimizationSuggestions,
  type AICallType,
  type AICallLogEntry,
} from './debugLogger';

describe('debugLogger', () => {
  beforeEach(() => {
    clearLogHistory();
    setDebugEnabled(false); // Disable console output during tests
    vi.clearAllMocks();
  });

  describe('logAICall', () => {
    it('should create a log entry and return id', () => {
      const logId = logAICall('scene_description', {
        skillName: 'scene-description',
        promptTemplate: 'Test template',
        filledPrompt: 'Filled prompt',
        messages: [{ role: 'user', content: 'Test' }],
        context: {
          projectId: 'proj-1',
          sceneId: 'scene-1',
        },
        config: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          maxTokens: 500,
        },
      });

      expect(logId).toBeDefined();
      expect(logId).toMatch(/^log_/);
    });

    it('should add entry to log history', () => {
      logAICall('scene_description', {
        skillName: 'scene-description',
        promptTemplate: 'Test template',
        filledPrompt: 'Filled prompt',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      const history = getLogHistory();
      expect(history).toHaveLength(1);
    });

    it('should set initial status to pending', () => {
      logAICall('keyframe_prompt', {
        skillName: 'keyframe-prompt',
        promptTemplate: 'Template',
        filledPrompt: 'Filled',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      const history = getLogHistory();
      expect(history[0].status).toBe('pending');
    });

    it('should store all provided data', () => {
      const params = {
        skillName: 'scene-description',
        promptTemplate: 'Template {{var}}',
        filledPrompt: 'Template filled',
        messages: [{ role: 'user' as const, content: 'User message' }],
        context: {
          projectId: 'proj-123',
          style: 'cyberpunk',
          sceneOrder: 5,
        },
        config: {
          provider: 'kimi',
          model: 'moonshot-v1',
          maxTokens: 1000,
        },
      };

      logAICall('scene_description', params);

      const history = getLogHistory();
      const entry = history[0];

      expect(entry.callType).toBe('scene_description');
      expect(entry.skillName).toBe('scene-description');
      expect(entry.promptTemplate).toBe('Template {{var}}');
      expect(entry.filledPrompt).toBe('Template filled');
      expect(entry.context.projectId).toBe('proj-123');
      expect(entry.config.provider).toBe('kimi');
    });

    it('should limit history to MAX_LOG_ENTRIES', () => {
      // Create more than 100 entries
      for (let i = 0; i < 105; i++) {
        logAICall('scene_description', {
          skillName: 'test',
          promptTemplate: `Template ${i}`,
          filledPrompt: `Filled ${i}`,
          messages: [{ role: 'user', content: `Test ${i}` }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });
      }

      const history = getLogHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('updateLogWithResponse', () => {
    it('should update entry with response data', () => {
      const logId = logAICall('scene_description', {
        skillName: 'scene-description',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogWithResponse(logId, {
        content: 'AI Response Content',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.status).toBe('success');
      expect(entry?.response?.content).toBe('AI Response Content');
      expect(entry?.response?.tokenUsage?.total).toBe(150);
    });

    it('should set status to success', () => {
      const logId = logAICall('keyframe_prompt', {
        skillName: 'keyframe-prompt',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogWithResponse(logId, { content: 'Response' });

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);
      expect(entry?.status).toBe('success');
    });
  });

  describe('updateLogWithError', () => {
    it('should update entry with error info', () => {
      const logId = logAICall('motion_prompt', {
        skillName: 'motion-prompt',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogWithError(logId, 'Network connection failed');

      const history = getLogHistory();
      const entry = history.find(e => e.id === logId);

      expect(entry?.status).toBe('error');
      expect(entry?.error).toBe('Network connection failed');
    });
  });

  describe('event subscription', () => {
    it('should emit call:start event when logging', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:start', callback);

      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      expect(callback).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should emit call:success event on response', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:success', callback);

      const logId = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogWithResponse(logId, { content: 'Response' });

      expect(callback).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should emit call:error event on error', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:error', callback);

      const logId = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogWithError(logId, 'Error occurred');

      expect(callback).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('should emit call:progress event on progress update', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:progress', callback);

      const logId = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      updateLogProgress(logId, 50, 'Half done');

      expect(callback).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('unsubscribe should stop receiving events', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToAIEvents('call:start', callback);

      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      logAICall('keyframe_prompt', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      expect(callback).toHaveBeenCalledTimes(1); // Should not increase
    });
  });

  describe('getCallStatsByType', () => {
    it('should return empty object when no logs', () => {
      const stats = getCallStatsByType();
      expect(Object.keys(stats)).toHaveLength(0);
    });

    it('should count calls by type', () => {
      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      logAICall('keyframe_prompt', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      const stats = getCallStatsByType();
      expect(stats.scene_description?.total).toBe(2);
      expect(stats.keyframe_prompt?.total).toBe(1);
    });

    it('should track success and error counts', () => {
      const id1 = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });
      updateLogWithResponse(id1, { content: 'Success' });

      const id2 = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });
      updateLogWithError(id2, 'Error');

      const stats = getCallStatsByType();
      expect(stats.scene_description?.success).toBe(1);
      expect(stats.scene_description?.error).toBe(1);
    });
  });

  describe('getRecentErrors', () => {
    it('should return empty array when no errors', () => {
      const errors = getRecentErrors();
      expect(errors).toHaveLength(0);
    });

    it('should return only error entries', () => {
      const id1 = logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });
      updateLogWithResponse(id1, { content: 'Success' });

      const id2 = logAICall('keyframe_prompt', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });
      updateLogWithError(id2, 'Error occurred');

      const errors = getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].status).toBe('error');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 15; i++) {
        const id = logAICall('scene_description', {
          skillName: 'test',
          promptTemplate: 'Test',
          filledPrompt: 'Test',
          messages: [{ role: 'user', content: 'Test' }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });
        updateLogWithError(id, `Error ${i}`);
      }

      const errors = getRecentErrors(5);
      expect(errors).toHaveLength(5);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should return positive message when no issues', () => {
      const suggestions = getOptimizationSuggestions();
      expect(suggestions).toContain('✅ 当前AI调用状态良好，无优化建议');
    });

    it('should suggest checking prompts for high error rate', () => {
      // Create entries with high error rate
      for (let i = 0; i < 5; i++) {
        const id = logAICall('scene_description', {
          skillName: 'test',
          promptTemplate: 'Test',
          filledPrompt: 'Test',
          messages: [{ role: 'user', content: 'Test' }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });
        if (i < 3) {
          updateLogWithError(id, 'Error');
        } else {
          updateLogWithResponse(id, { content: 'Success' });
        }
      }

      const suggestions = getOptimizationSuggestions();
      expect(suggestions.some(s => s.includes('错误率过高'))).toBe(true);
    });

    it('should suggest optimizing for high token usage', () => {
      for (let i = 0; i < 5; i++) {
        const id = logAICall('scene_description', {
          skillName: 'test',
          promptTemplate: 'Test',
          filledPrompt: 'Test',
          messages: [{ role: 'user', content: 'Test' }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });
        updateLogWithResponse(id, { 
          content: 'Success', 
          tokenUsage: { prompt: 1500, completion: 1000, total: 2500 } 
        });
      }

      const suggestions = getOptimizationSuggestions();
      expect(suggestions.some(s => s.includes('Token消耗较高'))).toBe(true);
    });

    it('should suggest checking network for multiple failures', () => {
      for (let i = 0; i < 7; i++) {
        const id = logAICall('scene_description', {
          skillName: 'test',
          promptTemplate: 'Test',
          filledPrompt: 'Test',
          messages: [{ role: 'user', content: 'Test' }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });
        updateLogWithError(id, 'Network error');
      }

      const suggestions = getOptimizationSuggestions();
      expect(suggestions.some(s => s.includes('多次调用失败'))).toBe(true);
    });
  });

  describe('clearLogHistory', () => {
    it('should remove all log entries', () => {
      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: {},
        config: { provider: 'deepseek', model: 'model' },
      });

      expect(getLogHistory()).toHaveLength(1);

      clearLogHistory();

      expect(getLogHistory()).toHaveLength(0);
    });
  });

  describe('exportLogs', () => {
    it('should return JSON string of log history', () => {
      logAICall('scene_description', {
        skillName: 'test',
        promptTemplate: 'Test',
        filledPrompt: 'Test',
        messages: [{ role: 'user', content: 'Test' }],
        context: { projectId: 'proj-1' },
        config: { provider: 'deepseek', model: 'model' },
      });

      const exported = exportLogs();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].callType).toBe('scene_description');
    });
  });

  describe('debug mode controls', () => {
    it('setDebugEnabled should update debug state', () => {
      setDebugEnabled(true);
      expect(isDebugEnabled()).toBe(true);

      setDebugEnabled(false);
      expect(isDebugEnabled()).toBe(false);
    });

    it('setProgressTrackingEnabled should update tracking state', () => {
      setProgressTrackingEnabled(true);
      expect(isProgressTrackingEnabled()).toBe(true);

      setProgressTrackingEnabled(false);
      expect(isProgressTrackingEnabled()).toBe(false);
    });
  });

  describe('different call types', () => {
    const callTypes: AICallType[] = [
      'scene_list_generation',
      'scene_description',
      'action_description',
      'shot_prompt',
      'keyframe_prompt',
      'motion_prompt',
      'custom',
    ];

    callTypes.forEach(callType => {
      it(`should handle ${callType} call type`, () => {
        const logId = logAICall(callType, {
          skillName: 'test',
          promptTemplate: 'Test',
          filledPrompt: 'Test',
          messages: [{ role: 'user', content: 'Test' }],
          context: {},
          config: { provider: 'deepseek', model: 'model' },
        });

        const history = getLogHistory();
        const entry = history.find(e => e.id === logId);
        expect(entry?.callType).toBe(callType);
      });
    });
  });
});
