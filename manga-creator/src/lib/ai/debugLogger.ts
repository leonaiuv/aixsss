/**
 * AI调用调试日志器
 * 用于追踪每次AI调用时传输给AI的完整内容
 * 方便后续调整和优化提示词
 */

// AI调用类型
export type AICallType = 
  | 'scene_list_generation'      // 分镜列表生成
  | 'scene_description'          // 场景描述生成
  | 'action_description'         // 动作描述生成
  | 'shot_prompt'                // 镜头提示词生成
  | 'custom';                    // 自定义调用

// 上下文数据
export interface AICallContext {
  // 项目信息
  projectId?: string;
  projectTitle?: string;
  style?: string;           // 视觉风格
  protagonist?: string;     // 主角特征
  summary?: string;         // 故事梗概
  
  // 分镜信息
  sceneId?: string;
  sceneOrder?: number;
  sceneSummary?: string;    // 分镜概要
  prevSceneSummary?: string;// 前一分镜概要
  
  // 已生成内容
  sceneDescription?: string;  // 场景描述
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
  promptTemplate: string;    // 原始模板
  filledPrompt: string;      // 填充变量后的提示词
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
  status: 'pending' | 'success' | 'error';
  error?: string;
}

// 日志存储
const logHistory: AICallLogEntry[] = [];
const MAX_LOG_ENTRIES = 100;

// 是否启用调试模式
let debugEnabled = true;

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
    scene_description: '🎬 场景描述生成',
    action_description: '🏃 动作描述生成',
    shot_prompt: '🎯 镜头提示词生成',
    custom: '⚡ 自定义调用',
  };

  const divider = '═'.repeat(60);
  const subDivider = '─'.repeat(60);
  
  console.group(`%c${callTypeLabels[entry.callType]} [${entry.timestamp}]`, 
    'color: #10b981; font-weight: bold; font-size: 14px;');
  
  console.log(`%c${divider}`, 'color: #6366f1;');
  
  // 基本信息
  console.log('%c📌 基本信息', 'color: #f59e0b; font-weight: bold;');
  console.table({
    'ID': entry.id,
    '调用类型': entry.callType,
    '技能名称': entry.skillName || '-',
    'AI供应商': entry.config.provider,
    '模型': entry.config.model,
    '最大Token': entry.config.maxTokens || '默认',
  });

  console.log(`%c${subDivider}`, 'color: #94a3b8;');
  
  // 上下文数据
  console.log('%c📂 上下文数据（传递给AI的背景信息）', 'color: #f59e0b; font-weight: bold;');
  console.table({
    '项目ID': entry.context.projectId || '-',
    '视觉风格': entry.context.style || '-',
    '主角特征': entry.context.protagonist || '-',
    '故事梗概': entry.context.summary ? (entry.context.summary.length > 50 ? entry.context.summary.substring(0, 50) + '...' : entry.context.summary) : '-',
    '分镜序号': entry.context.sceneOrder || '-',
    '分镜概要': entry.context.sceneSummary || '-',
    '前一分镜': entry.context.prevSceneSummary || '-',
  });

  if (entry.context.sceneDescription) {
    console.log('%c已有场景描述:', 'color: #3b82f6;');
    console.log(entry.context.sceneDescription);
  }

  if (entry.context.actionDescription) {
    console.log('%c已有动作描述:', 'color: #3b82f6;');
    console.log(entry.context.actionDescription);
  }

  console.log(`%c${subDivider}`, 'color: #94a3b8;');
  
  // 提示词模板
  console.log('%c📝 提示词模板（原始）', 'color: #f59e0b; font-weight: bold;');
  console.log('%c' + entry.promptTemplate, 'color: #a78bfa; background: #1e1e2e; padding: 8px; border-radius: 4px; white-space: pre-wrap;');

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
    console.log('%c' + msg.content, 'color: #f0f9ff; background: #0f172a; padding: 8px; border-radius: 4px; white-space: pre-wrap;');
  });

  console.log(`%c${subDivider}`, 'color: #94a3b8;');
  
  // 填充后的提示词（完整版）
  console.log('%c📋 完整提示词（变量已替换）', 'color: #f59e0b; font-weight: bold;');
  console.log('%c' + entry.filledPrompt, 'color: #86efac; background: #052e16; padding: 8px; border-radius: 4px; white-space: pre-wrap;');

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
    };
  }
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
  }
): void {
  const entry = logHistory.find(e => e.id === logId);
  if (entry) {
    entry.response = response;
    entry.status = 'success';
    
    if (debugEnabled) {
      console.log(`%c✅ AI响应 [${entry.id}]`, 'color: #10b981; font-weight: bold;');
      console.log('%c响应内容:', 'color: #22d3ee;');
      console.log('%c' + response.content, 'color: #a5f3fc; background: #0c4a6e; padding: 8px; border-radius: 4px; white-space: pre-wrap;');
      if (response.tokenUsage) {
        console.table({
          'Prompt Tokens': response.tokenUsage.prompt,
          'Completion Tokens': response.tokenUsage.completion,
          'Total Tokens': response.tokenUsage.total,
        });
      }
    }
  }
}

/**
 * 更新日志条目的错误信息
 */
export function updateLogWithError(logId: string, error: string): void {
  const entry = logHistory.find(e => e.id === logId);
  if (entry) {
    entry.status = 'error';
    entry.error = error;
    
    if (debugEnabled) {
      console.error(`%c❌ AI调用失败 [${entry.id}]`, 'color: #ef4444; font-weight: bold;');
      console.error('错误信息:', error);
    }
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
  const summary = logHistory.reduce((acc, entry) => {
    acc[entry.callType] = (acc[entry.callType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('%c📊 AI调用统计摘要', 'color: #f59e0b; font-weight: bold; font-size: 16px;');
  console.table(summary);
  console.log(`总调用次数: ${logHistory.length}`);
  console.log(`成功: ${logHistory.filter(e => e.status === 'success').length}`);
  console.log(`失败: ${logHistory.filter(e => e.status === 'error').length}`);
  console.log(`进行中: ${logHistory.filter(e => e.status === 'pending').length}`);
}

// 暴露到全局对象，方便在控制台调用
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).aiDebug = {
    setEnabled: setDebugEnabled,
    isEnabled: isDebugEnabled,
    getHistory: getLogHistory,
    clear: clearLogHistory,
    export: exportLogs,
    summary: printLogSummary,
  };
  
  console.log('%c🔧 AI调试工具已加载', 'color: #10b981; font-weight: bold; font-size: 14px;');
  console.log('%c可用命令:', 'color: #f59e0b;');
  console.log('  window.aiDebug.setEnabled(true/false) - 启用/禁用调试日志');
  console.log('  window.aiDebug.getHistory() - 获取所有日志');
  console.log('  window.aiDebug.summary() - 打印统计摘要');
  console.log('  window.aiDebug.clear() - 清空日志');
  console.log('  window.aiDebug.export() - 导出日志为JSON');
}
