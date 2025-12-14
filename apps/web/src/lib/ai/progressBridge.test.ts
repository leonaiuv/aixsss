import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initProgressBridge,
  createProgressTask,
  notifyAIFallback,
  subscribeToFallbackEvents,
  getFallbackHistory,
  clearFallbackHistory,
} from './progressBridge';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import * as debugLogger from './debugLogger';

// Mock debugLogger
vi.mock('./debugLogger', async () => {
  const actual = (await vi.importActual('./debugLogger')) as typeof debugLogger;
  return {
    ...actual,
    subscribeToAIEvents: vi.fn(),
  };
});

describe('progressBridge', () => {
  let cleanupBridge: (() => void) | null = null;

  beforeEach(() => {
    // Reset store state
    useAIProgressStore.setState({
      tasks: [],
      activeTaskId: null,
      isQueuePaused: false,
      isPanelVisible: false,
      isPanelMinimized: false,
      filter: {},
      stats: {
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        totalTokensUsed: 0,
        costEstimate: 0,
      },
      listeners: new Map(),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (cleanupBridge) {
      cleanupBridge();
      cleanupBridge = null;
    }
  });

  describe('initProgressBridge', () => {
    it('should subscribe to all AI events', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      mockSubscribe.mockReturnValue(() => {});

      cleanupBridge = initProgressBridge();

      expect(mockSubscribe).toHaveBeenCalledWith('call:start', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('call:success', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('call:error', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('call:progress', expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalledWith('call:cancel', expect.any(Function));
    });

    it('should return cleanup function', () => {
      const unsubscribeMock = vi.fn();
      vi.mocked(debugLogger.subscribeToAIEvents).mockReturnValue(unsubscribeMock);

      cleanupBridge = initProgressBridge();

      expect(typeof cleanupBridge).toBe('function');

      cleanupBridge();

      // Should call all unsubscribe functions
      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('should create task when call:start event is received', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      let startCallback: ((entry: any) => void) | null = null;

      mockSubscribe.mockImplementation((event, callback) => {
        if (event === 'call:start') {
          startCallback = callback;
        }
        return () => {};
      });

      cleanupBridge = initProgressBridge();

      // Simulate call:start event
      const mockEntry = {
        id: 'log_123',
        callType: 'scene_description',
        context: {
          projectId: 'proj-1',
          sceneId: 'scene-1',
          sceneOrder: 1,
        },
      };

      startCallback!(mockEntry);

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].type).toBe('scene_description');
      expect(tasks[0].status).toBe('running');
    });

    it('should complete task when call:success event is received', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      let startCallback: ((entry: any) => void) | null = null;
      let successCallback: ((entry: any, extra?: any) => void) | null = null;

      mockSubscribe.mockImplementation((event, callback) => {
        if (event === 'call:start') {
          startCallback = callback;
        } else if (event === 'call:success') {
          successCallback = callback;
        }
        return () => {};
      });

      cleanupBridge = initProgressBridge();

      const mockEntry = {
        id: 'log_123',
        callType: 'scene_description',
        context: {},
      };

      startCallback!(mockEntry);

      // Simulate success
      const response = {
        content: 'AI Response',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      };
      successCallback!(mockEntry, response);

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks[0].status).toBe('success');
      expect(tasks[0].response).toEqual(response);
    });

    it('should fail task when call:error event is received', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      let startCallback: ((entry: any) => void) | null = null;
      let errorCallback: ((entry: any, extra?: any) => void) | null = null;

      mockSubscribe.mockImplementation((event, callback) => {
        if (event === 'call:start') {
          startCallback = callback;
        } else if (event === 'call:error') {
          errorCallback = callback;
        }
        return () => {};
      });

      cleanupBridge = initProgressBridge();

      const mockEntry = {
        id: 'log_123',
        callType: 'keyframe_prompt',
        context: {},
        error: 'Network error',
      };

      startCallback!(mockEntry);

      // Simulate error
      errorCallback!(mockEntry, { message: 'Network error' });

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks[0].status).toBe('error');
      expect(tasks[0].error?.message).toBe('Network error');
    });

    it('should update progress when call:progress event is received', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      let startCallback: ((entry: any) => void) | null = null;
      let progressCallback: ((entry: any, extra?: any) => void) | null = null;

      mockSubscribe.mockImplementation((event, callback) => {
        if (event === 'call:start') {
          startCallback = callback;
        } else if (event === 'call:progress') {
          progressCallback = callback;
        }
        return () => {};
      });

      cleanupBridge = initProgressBridge();

      const mockEntry = {
        id: 'log_123',
        callType: 'motion_prompt',
        context: {},
      };

      startCallback!(mockEntry);

      // Simulate progress update
      progressCallback!(mockEntry, { progress: 75, step: 'Processing response...' });

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks[0].progress).toBe(75);
      expect(tasks[0].currentStep).toBe('Processing response...');
    });

    it('should cancel task when call:cancel event is received', () => {
      const mockSubscribe = vi.mocked(debugLogger.subscribeToAIEvents);
      let startCallback: ((entry: any) => void) | null = null;
      let cancelCallback: ((entry: any, extra?: any) => void) | null = null;

      mockSubscribe.mockImplementation((event, callback) => {
        if (event === 'call:start') {
          startCallback = callback;
        } else if (event === 'call:cancel') {
          cancelCallback = callback;
        }
        return () => {};
      });

      cleanupBridge = initProgressBridge();

      const mockEntry = {
        id: 'log_123',
        callType: 'scene_description',
        context: {},
      };

      startCallback!(mockEntry);
      cancelCallback!(mockEntry, { message: '用户取消' });

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks[0].status).toBe('cancelled');
    });
  });

  describe('createProgressTask', () => {
    it('should create a new task and return control object', () => {
      const result = createProgressTask('scene_description', {
        projectId: 'proj-1',
        sceneId: 'scene-1',
        sceneOrder: 1,
      });

      expect(result.taskId).toBeDefined();
      expect(typeof result.updateProgress).toBe('function');
      expect(typeof result.complete).toBe('function');
      expect(typeof result.fail).toBe('function');

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks).toHaveLength(1);
    });

    it('should allow updating progress via control object', () => {
      const result = createProgressTask('keyframe_prompt');

      result.updateProgress(50, 'Half done');

      const task = useAIProgressStore.getState().getTask(result.taskId);
      expect(task?.progress).toBe(50);
      expect(task?.currentStep).toBe('Half done');
    });

    it('should allow completing task via control object', () => {
      const result = createProgressTask('motion_prompt');

      const response = { content: 'Result' };
      result.complete(response);

      const task = useAIProgressStore.getState().getTask(result.taskId);
      expect(task?.status).toBe('success');
      expect(task?.response).toEqual(response);
    });

    it('should allow failing task via control object', () => {
      const result = createProgressTask('scene_list_generation');

      result.fail('API timeout');

      const task = useAIProgressStore.getState().getTask(result.taskId);
      expect(task?.status).toBe('error');
      expect(task?.error?.message).toBe('API timeout');
    });

    it('should use correct title and description for each type', () => {
      const types = [
        { type: 'scene_list_generation' as const, title: '生成分镜列表' },
        { type: 'scene_description' as const, title: '生成场景锚点' },
        { type: 'keyframe_prompt' as const, title: '生成关键帧提示词（KF0/KF1/KF2）' },
        { type: 'motion_prompt' as const, title: '生成时空/运动提示词' },
        { type: 'custom' as const, title: '自定义AI调用' },
      ];

      types.forEach(({ type, title }) => {
        useAIProgressStore.setState({ tasks: [] });

        const result = createProgressTask(type);
        const task = useAIProgressStore.getState().getTask(result.taskId);

        expect(task?.title).toBe(title);
      });
    });

    it('should set context information correctly', () => {
      const result = createProgressTask('scene_description', {
        projectId: 'project-abc',
        sceneId: 'scene-xyz',
        sceneOrder: 5,
      });

      const task = useAIProgressStore.getState().getTask(result.taskId);
      expect(task?.projectId).toBe('project-abc');
      expect(task?.sceneId).toBe('scene-xyz');
      expect(task?.sceneOrder).toBe(5);
    });

    it('should initialize with running status and 0 progress', () => {
      const result = createProgressTask('scene_description');

      const task = useAIProgressStore.getState().getTask(result.taskId);
      expect(task?.status).toBe('running');
      expect(task?.progress).toBe(0);
      expect(task?.currentStep).toBe('准备中...');
    });
  });

  // ==========================================
  // Fallback 通知系统测试
  // ==========================================
  describe('notifyAIFallback', () => {
    beforeEach(() => {
      clearFallbackHistory();
    });

    it('应该创建警告任务通知用户', () => {
      notifyAIFallback('情绪提取', new Error('API超时'), '关键词匹配');

      const tasks = useAIProgressStore.getState().tasks;
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].title).toContain('情绪提取');
      expect(tasks[0].title).toContain('已降级');
    });

    it('应该记录到历史', () => {
      notifyAIFallback('文本压缩', '网络错误', '截断处理');

      const history = getFallbackHistory();
      expect(history.length).toBe(1);
      expect(history[0].feature).toBe('文本压缩');
      expect(history[0].message).toBe('网络错误');
      expect(history[0].fallbackTo).toBe('截断处理');
    });

    it('应该正确检测timeout类型', () => {
      notifyAIFallback('测试', 'Request timeout', '规则');

      const history = getFallbackHistory();
      expect(history[0].reason).toBe('timeout');
    });

    it('应该正确检测网络错误类型', () => {
      notifyAIFallback('测试', '网络连接失败', '规则');

      const history = getFallbackHistory();
      expect(history[0].reason).toBe('network_error');
    });

    it('应该正确检测解析错误类型', () => {
      notifyAIFallback('测试', 'JSON parse error', '规则');

      const history = getFallbackHistory();
      expect(history[0].reason).toBe('parse_error');
    });

    it('应该正确检测API错误类型', () => {
      notifyAIFallback('测试', 'API request failed', '规则');

      const history = getFallbackHistory();
      expect(history[0].reason).toBe('api_error');
    });

    it('未知错误应为unknown类型', () => {
      notifyAIFallback('测试', '一些奇怪的错误', '规则');

      const history = getFallbackHistory();
      expect(history[0].reason).toBe('unknown');
    });
  });

  describe('subscribeToFallbackEvents', () => {
    beforeEach(() => {
      clearFallbackHistory();
    });

    it('应该收到fallback事件', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToFallbackEvents(callback);

      notifyAIFallback('测试功能', 'error', '规则');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: '测试功能',
          message: 'error',
          fallbackTo: '规则',
        }),
      );

      unsubscribe();
    });

    it('取消订阅后不应收到事件', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToFallbackEvents(callback);

      unsubscribe();

      notifyAIFallback('测试', 'error', '规则');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getFallbackHistory / clearFallbackHistory', () => {
    beforeEach(() => {
      clearFallbackHistory();
    });

    it('应该记录多个fallback', () => {
      notifyAIFallback('功能1', 'error1', '规则1');
      notifyAIFallback('功能2', 'error2', '规则2');
      notifyAIFallback('功能3', 'error3', '规则3');

      const history = getFallbackHistory();
      expect(history.length).toBe(3);
      // 最新的在前面
      expect(history[0].feature).toBe('功能3');
    });

    it('应该能清空历史', () => {
      notifyAIFallback('测试', 'error', '规则');

      clearFallbackHistory();

      const history = getFallbackHistory();
      expect(history.length).toBe(0);
    });
  });
});
