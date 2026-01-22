/**
 * AI调用调试日志器
 * 用于追踪每次AI调用时传输给AI的完整内容
 * 方便后续调整和优化提示词
 *
 * 增强版：集成进度追踪系统，支持实时通知
 */

// AI调用类型
export type AICallType =
  | 'scene_list_generation' // 分镜列表生成
  | 'scene_description' // 场景锚点生成
  | 'action_description' // 动作描述生成（已废弃，保留兼容）
  | 'shot_prompt' // 镜头提示词生成（已废弃，保留兼容）
  | 'keyframe_prompt' // 关键帧提示词生成（KF0-KF8）
  | 'motion_prompt' // 时空/运动提示词生成
  | 'dialogue' // 台词生成
  | 'episode_plan' // 剧集规划生成
  | 'narrative_causal_chain' // 叙事因果链生成
  | 'episode_core_expression' // 单集核心表达生成
  | 'episode_core_expression_batch' // 单集核心表达批量生成
  | 'episode_scene_list' // 单集分镜列表生成
  | 'scene_refine_all' // 一键细化（后端工作流）
  | 'storyboard_scene_bible' // Storyboard 81：SceneBible（压缩档）
  | 'storyboard_plan' // Storyboard 81：9组大纲（Plan）
  | 'storyboard_group' // Storyboard 81：单组（9格）
  | 'storyboard_translate' // Storyboard 81：翻译 EN→ZH
  | 'storyboard_back_translate' // Storyboard 81：回译 ZH→EN
  | 'character_basic_info' // 角色基础信息生成
  | 'character_portrait' // 角色定妆照提示词生成
  | 'custom'; // 自定义调用

// ==========================================
// 事件系统
// ==========================================

export type AILogEvent =
  | 'call:start'
  | 'call:success'
  | 'call:error'
  | 'call:progress'
  | 'call:output'
  | 'call:cancel';

type EventCallback = (entry: AICallLogEntry, extra?: unknown) => void;
const eventListeners: Map<AILogEvent, EventCallback[]> = new Map();

/**
 * 订阅AI日志事件
 */
export function subscribeToAIEvents(event: AILogEvent, callback: EventCallback): () => void {
  const listeners = eventListeners.get(event) || [];
  listeners.push(callback);
  eventListeners.set(event, listeners);

  return () => {
    const current = eventListeners.get(event) || [];
    eventListeners.set(
      event,
      current.filter((cb) => cb !== callback),
    );
  };
}

/**
 * 发射AI日志事件
 */
function emitAIEvent(event: AILogEvent, entry: AICallLogEntry, extra?: unknown): void {
  const listeners = eventListeners.get(event) || [];
  listeners.forEach((callback) => {
    try {
      callback(entry, extra);
    } catch (err) {
      console.error(`[AI Debug] Event listener error for ${event}:`, err);
    }
  });
}

// 上下文数据
export interface AICallContext {
  // 项目信息
  projectId?: string;
  projectTitle?: string;
  style?: string; // 视觉风格
  protagonist?: string; // 主角特征
  summary?: string; // 故事梗概

  // 分镜信息
  sceneId?: string;
  sceneOrder?: number;
  sceneSummary?: string; // 分镜概要
  prevSceneSummary?: string; // 前一分镜概要

  // 已生成内容
  sceneDescription?: string; // 场景锚点（原字段名 sceneDescription）
  actionDescription?: string; // 动作描述

  // 其他上下文
  [key: string]: unknown;
}

// AI调用日志条目
export interface AICallLogEntry {
  id: string;
  timestamp: string;
  callType: AICallType;
  skillName?: string;

  // 发送给AI的内容
  promptTemplate: string; // 原始模板
  filledPrompt: string; // 填充变量后的提示词
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  // 上下文数据
  context: AICallContext;

  // 配置信息
  config: {
    provider: string;
    model: string;
    maxTokens?: number;
    profileId?: string;
  };

  // 响应信息（可选，成功后填充）
  response?: {
    content: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  };

  // 状态
  status: 'pending' | 'success' | 'error' | 'cancelled';
  error?: string;
}

// 日志存储
const logHistory: AICallLogEntry[] = [];
const MAX_LOG_ENTRIES = 100;

// 是否启用调试模式
let debugEnabled = true;

// 是否启用进度追踪集成
let progressTrackingEnabled = true;

/**
 * 启用/禁用进度追踪集成
 */
export function setProgressTrackingEnabled(enabled: boolean): void {
  progressTrackingEnabled = enabled;
  console.log(`[AI Debug] 进度追踪集成已${enabled ? '启用' : '禁用'}`);
}

/**
 * 检查进度追踪是否启用
 */
export function isProgressTrackingEnabled(): boolean {
  return progressTrackingEnabled;
}

/**
 * 启用/禁用调试日志
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
  console.log(`[AI Debug] 调试日志已${enabled ? '启用' : '禁用'}`);
}

/**
 * 检查调试模式是否启用
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化日志输出
 */
function formatLogOutput(entry: AICallLogEntry): void {
  const callTypeLabels: Record<AICallType, string> = {
    scene_list_generation: '📋 分镜列表生成',
    scene_description: '🎬 场景锚点生成',
    action_description: '🏃 动作描述生成',
    shot_prompt: '🎯 镜头提示词生成',
    keyframe_prompt: '🖼️ 关键帧提示词生成（KF0-KF8）',
    motion_prompt: '🎬 时空/运动提示词生成',
    dialogue: '💬 台词生成',
    episode_plan: '🎞️ 剧集规划生成',
    narrative_causal_chain: '🧩 叙事因果链生成',
    episode_core_expression: '🧠 单集核心表达生成',
    episode_core_expression_batch: '🧠 单集核心表达批量生成',
    episode_scene_list: '🗂️ 单集分镜列表生成',
    scene_refine_all: '✨ 一键细化',
    storyboard_scene_bible: '🧾 Storyboard：SceneBible',
    storyboard_plan: '🧩 Storyboard：Plan（9组大纲）',
    storyboard_group: '🧱 Storyboard：Group（单组 9 格）',
    storyboard_translate: '🌐 Storyboard：翻译（EN→ZH）',
    storyboard_back_translate: '🔁 Storyboard：回译（ZH→EN）',
    character_basic_info: '👤 角色信息生成',
    character_portrait: '📷 角色定妆照生成',
    custom: '⚡ 自定义调用',
  };

  const divider = '═'.repeat(60);
  const subDivider = '─'.repeat(60);

  console.group(
    `%c${callTypeLabels[entry.callType]} [${entry.timestamp}]`,
    'color: #10b981; font-weight: bold; font-size: 14px;',
  );

  console.log(`%c${divider}`, 'color: #6366f1;');

  // 基本信息
  console.log('%c📌 基本信息', 'color: #f59e0b; font-weight: bold;');
  console.table({
    ID: entry.id,
    调用类型: entry.callType,
    技能名称: entry.skillName || '-',
    AI供应商: entry.config.provider,
    模型: entry.config.model,
    最大Token: entry.config.maxTokens || '默认',
  });

  console.log(`%c${subDivider}`, 'color: #94a3b8;');

  // 上下文数据
  console.log('%c📂 上下文数据（传递给AI的背景信息）', 'color: #f59e0b; font-weight: bold;');
  console.table({
    项目ID: entry.context.projectId || '-',
    视觉风格: entry.context.style || '-',
    主角特征: entry.context.protagonist || '-',
    故事梗概: entry.context.summary
      ? entry.context.summary.length > 50
        ? entry.context.summary.substring(0, 50) + '...'
        : entry.context.summary
      : '-',
    分镜序号: entry.context.sceneOrder || '-',
    分镜概要: entry.context.sceneSummary || '-',
    前一分镜: entry.context.prevSceneSummary || '-',
  });

  if (entry.context.sceneDescription) {
    console.log('%c已有场景锚点:', 'color: #3b82f6;');
    console.log(entry.context.sceneDescription);
  }

  if (entry.context.actionDescription) {
    console.log('%c已有动作描述:', 'color: #3b82f6;');
    console.log(entry.context.actionDescription);
  }

  console.log(`%c${subDivider}`, 'color: #94a3b8;');

  // 提示词模板
  console.log('%c📝 提示词模板（原始）', 'color: #f59e0b; font-weight: bold;');
  console.log(
    '%c' + entry.promptTemplate,
    'color: #a78bfa; background: #1e1e2e; padding: 8px; border-radius: 4px; white-space: pre-wrap;',
  );

  console.log(`%c${subDivider}`, 'color: #94a3b8;');

  // 实际发送的消息
  console.log('%c📤 实际发送给AI的消息', 'color: #f59e0b; font-weight: bold;');
  entry.messages.forEach((msg) => {
    const roleLabels: Record<string, string> = {
      system: '🤖 System',
      user: '👤 User',
      assistant: '💬 Assistant',
    };
    console.log(`%c${roleLabels[msg.role] || msg.role}:`, 'color: #22d3ee; font-weight: bold;');
    console.log(
      '%c' + msg.content,
      'color: #f0f9ff; background: #0f172a; padding: 8px; border-radius: 4px; white-space: pre-wrap;',
    );
  });

  console.log(`%c${subDivider}`, 'color: #94a3b8;');

  // 填充后的提示词（完整版）
  console.log('%c📋 完整提示词（变量已替换）', 'color: #f59e0b; font-weight: bold;');
  console.log(
    '%c' + entry.filledPrompt,
    'color: #86efac; background: #052e16; padding: 8px; border-radius: 4px; white-space: pre-wrap;',
  );

  console.log(`%c${divider}`, 'color: #6366f1;');

  console.groupEnd();
}

/**
 * 记录AI调用日志
 */
export function logAICall(
  callType: AICallType,
  params: {
    skillName?: string;
    promptTemplate: string;
    filledPrompt: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    context: AICallContext;
    config: {
      provider: string;
      model: string;
      maxTokens?: number;
      profileId?: string;
    };
  },
): string {
  const entry: AICallLogEntry = {
    id: generateId(),
    timestamp: new Date().toLocaleString('zh-CN'),
    callType,
    skillName: params.skillName,
    promptTemplate: params.promptTemplate,
    filledPrompt: params.filledPrompt,
    messages: params.messages,
    context: params.context,
    config: params.config,
    status: 'pending',
  };

  // 添加到历史
  logHistory.push(entry);

  // 限制历史长度
  if (logHistory.length > MAX_LOG_ENTRIES) {
    logHistory.shift();
  }

  // 输出到控制台
  if (debugEnabled) {
    formatLogOutput(entry);
  }

  // 发射事件通知
  emitAIEvent('call:start', entry);

  return entry.id;
}

/**
 * 更新日志条目的响应信息
 */
export function updateLogWithResponse(
  logId: string,
  response: {
    content: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  },
): void {
  const entry = logHistory.find((e) => e.id === logId);
  if (entry) {
    entry.response = response;
    entry.status = 'success';

    if (debugEnabled) {
      console.log(`%c✅ AI响应 [${entry.id}]`, 'color: #10b981; font-weight: bold;');
      console.log('%c响应内容:', 'color: #22d3ee;');
      console.log(
        '%c' + response.content,
        'color: #a5f3fc; background: #0c4a6e; padding: 8px; border-radius: 4px; white-space: pre-wrap;',
      );
      if (response.tokenUsage) {
        console.table({
          'Prompt Tokens': response.tokenUsage.prompt,
          'Completion Tokens': response.tokenUsage.completion,
          'Total Tokens': response.tokenUsage.total,
        });
      }
    }

    // 发射成功事件
    emitAIEvent('call:success', entry, response);
  }
}

/**
 * 更新日志条目的错误信息
 */
export function updateLogWithError(logId: string, error: string): void {
  const entry = logHistory.find((e) => e.id === logId);
  if (entry) {
    entry.status = 'error';
    entry.error = error;

    if (debugEnabled) {
      console.error(`%c❌ AI调用失败 [${entry.id}]`, 'color: #ef4444; font-weight: bold;');
      console.error('错误信息:', error);
    }

    // 发射错误事件
    emitAIEvent('call:error', entry, { message: error });
  }
}

/**
 * 标记日志为已取消
 */
export function updateLogWithCancelled(logId: string, reason: string = '用户取消'): void {
  const entry = logHistory.find((e) => e.id === logId);
  if (entry) {
    entry.status = 'cancelled';
    entry.error = reason;

    if (debugEnabled) {
      console.warn(`%c⏹️ AI调用已取消 [${entry.id}]`, 'color: #64748b; font-weight: bold;');
      console.warn('取消原因:', reason);
    }

    emitAIEvent('call:cancel', entry, { message: reason });
  }
}

/**
 * 更新日志进度
 */
export function updateLogProgress(logId: string, progress: number, step?: string): void {
  const entry = logHistory.find((e) => e.id === logId);
  if (entry) {
    // 发射进度事件
    emitAIEvent('call:progress', entry, { progress, step });
  }
}

/**
 * 更新日志输出（用于 DevPanel 的“流式输出/原始输出”监控）
 * 注意：这不是最终 response（不会标记 success），只是调试侧的中间输出快照。
 */
export function updateLogOutput(
  logId: string,
  output: string,
  options?: { append?: boolean },
): void {
  const entry = logHistory.find((e) => e.id === logId);
  if (entry) {
    emitAIEvent('call:output', entry, { output, append: options?.append === true });
  }
}

/**
 * 获取所有日志历史
 */
export function getLogHistory(): AICallLogEntry[] {
  return [...logHistory];
}

/**
 * 清空日志历史
 */
export function clearLogHistory(): void {
  logHistory.length = 0;
  console.log('[AI Debug] 日志历史已清空');
}

/**
 * 导出日志为JSON
 */
export function exportLogs(): string {
  return JSON.stringify(logHistory, null, 2);
}

/**
 * 打印日志摘要
 */
export function printLogSummary(): void {
  const summary = logHistory.reduce(
    (acc, entry) => {
      acc[entry.callType] = (acc[entry.callType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('%c📊 AI调用统计摘要', 'color: #f59e0b; font-weight: bold; font-size: 16px;');
  console.table(summary);
  console.log(`总调用次数: ${logHistory.length}`);
  console.log(`成功: ${logHistory.filter((e) => e.status === 'success').length}`);
  console.log(`失败: ${logHistory.filter((e) => e.status === 'error').length}`);
  console.log(`取消: ${logHistory.filter((e) => e.status === 'cancelled').length}`);
  console.log(`进行中: ${logHistory.filter((e) => e.status === 'pending').length}`);
}

/**
 * 获取按类型分组的调用统计
 */
export function getCallStatsByType(): Record<
  AICallType,
  { total: number; success: number; error: number; avgTime: number }
> {
  const stats: Record<
    string,
    { total: number; success: number; error: number; totalTime: number; count: number }
  > = {};

  logHistory.forEach((entry) => {
    if (!stats[entry.callType]) {
      stats[entry.callType] = { total: 0, success: 0, error: 0, totalTime: 0, count: 0 };
    }
    stats[entry.callType].total++;
    if (entry.status === 'success') {
      stats[entry.callType].success++;
    } else if (entry.status === 'error') {
      stats[entry.callType].error++;
    }
  });

  const result: Record<string, { total: number; success: number; error: number; avgTime: number }> =
    {};
  Object.entries(stats).forEach(([type, data]) => {
    result[type] = {
      total: data.total,
      success: data.success,
      error: data.error,
      avgTime: data.count > 0 ? data.totalTime / data.count : 0,
    };
  });

  return result as Record<
    AICallType,
    { total: number; success: number; error: number; avgTime: number }
  >;
}

/**
 * 获取最近的错误列表
 */
export function getRecentErrors(limit: number = 10): AICallLogEntry[] {
  return logHistory.filter((e) => e.status === 'error').slice(-limit);
}

/**
 * 获取优化建议
 */
export function getOptimizationSuggestions(): string[] {
  const suggestions: string[] = [];
  const stats = getCallStatsByType();

  // 检查错误率
  Object.entries(stats).forEach(([type, data]) => {
    if (data.total > 0) {
      const errorRate = data.error / data.total;
      if (errorRate > 0.3) {
        suggestions.push(
          `⚠️ ${type} 错误率过高 (${(errorRate * 100).toFixed(1)}%)，建议检查提示词或API配置`,
        );
      }
    }
  });

  // 检查Token使用
  const highTokenEntries = logHistory.filter(
    (e) => e.response?.tokenUsage && e.response.tokenUsage.total > 2000,
  );
  if (highTokenEntries.length > 3) {
    suggestions.push('💡 部分调用Token消耗较高，建议优化提示词以减少成本');
  }

  // 检查重试次数
  const errorEntries = logHistory.filter((e) => e.status === 'error');
  if (errorEntries.length > 5) {
    suggestions.push('🔄 多次调用失败，建议检查网络连接或API密钥');
  }

  if (suggestions.length === 0) {
    suggestions.push('✅ 当前AI调用状态良好，无优化建议');
  }

  return suggestions;
}

// 暴露到全局对象，方便在控制台调用
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).aiDebug = {
    setEnabled: setDebugEnabled,
    isEnabled: isDebugEnabled,
    setProgressTracking: setProgressTrackingEnabled,
    isProgressTracking: isProgressTrackingEnabled,
    getHistory: getLogHistory,
    clear: clearLogHistory,
    export: exportLogs,
    summary: printLogSummary,
    getStatsByType: getCallStatsByType,
    getErrors: getRecentErrors,
    getSuggestions: getOptimizationSuggestions,
    subscribe: subscribeToAIEvents,
  };

  console.log(
    '%c🔧 AI调试工具已加载 (增强版)',
    'color: #10b981; font-weight: bold; font-size: 14px;',
  );
  console.log('%c可用命令:', 'color: #f59e0b;');
  console.log('  window.aiDebug.setEnabled(true/false) - 启用/禁用调试日志');
  console.log('  window.aiDebug.getHistory() - 获取所有日志');
  console.log('  window.aiDebug.summary() - 打印统计摘要');
  console.log('  window.aiDebug.clear() - 清空日志');
  console.log('  window.aiDebug.export() - 导出日志为JSON');
  console.log('  window.aiDebug.getStatsByType() - 按类型获取统计');
  console.log('  window.aiDebug.getErrors() - 获取最近错误');
  console.log('  window.aiDebug.getSuggestions() - 获取优化建议');
  console.log('  window.aiDebug.subscribe(event, callback) - 订阅事件');
}
