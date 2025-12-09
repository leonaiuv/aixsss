// ==========================================
// 上下文压缩器
// ==========================================
// 功能：
// 1. 智能压缩对话历史，保留关键信息
// 2. 动态调整token预算，避免超出API限制
// 3. 支持多种压缩策略（激进/平衡/保守）
// 
// 支持两种模式：
// - 规则引擎：快速、零延迟
// - AI智能生成：语义理解、智能摘要（带fallback）
// ==========================================

import { Project, Scene, CompressionStrategy, Skill, ChatMessage } from '@/types';
import { notifyAIFallback } from './progressBridge';

// Token估算（简化版，1个汉字≈2 tokens，1个英文词≈1.3 tokens）
function estimateTokens(text: string): number {
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  const englishWords = text.match(/[a-zA-Z]+/g)?.length || 0;
  const other = text.length - chineseChars - englishWords;
  return Math.ceil(chineseChars * 2 + englishWords * 1.3 + other * 0.5);
}

// 压缩策略配置
const STRATEGY_CONFIG: Record<CompressionStrategy, {
  maxProjectTokens: number;
  maxSceneTokens: number;
  maxHistoryItems: number;
}> = {
  aggressive: {
    maxProjectTokens: 200,
    maxSceneTokens: 150,
    maxHistoryItems: 1,
  },
  balanced: {
    maxProjectTokens: 400,
    maxSceneTokens: 300,
    maxHistoryItems: 3,
  },
  conservative: {
    maxProjectTokens: 600,
    maxSceneTokens: 500,
    maxHistoryItems: 5,
  },
};

/**
 * 压缩项目核心信息
 */
export function compressProjectEssence(
  project: Project,
  strategy: CompressionStrategy = 'balanced'
): {
  style: string;
  protagonistCore: string;
  storyCore: string;
  tokens: number;
} {
  const config = STRATEGY_CONFIG[strategy];
  
  // 风格直接保留
  const style = project.style;
  
  // 压缩主角描述
  let protagonistCore = project.protagonist;
  let protagonistTokens = estimateTokens(protagonistCore);
  if (protagonistTokens > config.maxProjectTokens * 0.3) {
    // 提取关键特征（前N个字符）
    const targetLength = Math.floor(config.maxProjectTokens * 0.3 / 2);
    protagonistCore = protagonistCore.slice(0, targetLength) + '...';
    protagonistTokens = estimateTokens(protagonistCore);
  }
  
  // 压缩故事梗概
  let storyCore = project.summary;
  let storyTokens = estimateTokens(storyCore);
  if (storyTokens > config.maxProjectTokens * 0.7) {
    const targetLength = Math.floor(config.maxProjectTokens * 0.7 / 2);
    storyCore = storyCore.slice(0, targetLength) + '...';
    storyTokens = estimateTokens(storyCore);
  }
  
  return {
    style,
    protagonistCore,
    storyCore,
    tokens: estimateTokens(style) + protagonistTokens + storyTokens,
  };
}

/**
 * 压缩分镜摘要
 */
export function compressSceneSummary(
  scene: Scene,
  strategy: CompressionStrategy = 'balanced'
): {
  summary: string;
  mood?: string;
  keyElement?: string;
  tokens: number;
} {
  const config = STRATEGY_CONFIG[strategy];
  
  let summary = scene.summary;
  let summaryTokens = estimateTokens(summary);
  
  if (summaryTokens > config.maxSceneTokens) {
    const targetLength = Math.floor(config.maxSceneTokens / 2);
    summary = summary.slice(0, targetLength) + '...';
    summaryTokens = estimateTokens(summary);
  }
  
  // 提取情绪和关键元素（简化版）
  const mood = extractMood(scene.summary);
  const keyElement = extractKeyElement(scene.summary);
  
  return {
    summary,
    mood,
    keyElement,
    tokens: summaryTokens,
  };
}

/**
 * 压缩场景历史上下文
 */
export function compressSceneHistory(
  scenes: Scene[],
  currentIndex: number,
  strategy: CompressionStrategy = 'balanced'
): {
  compressed: string;
  tokens: number;
} {
  const config = STRATEGY_CONFIG[strategy];
  const historyCount = config.maxHistoryItems;
  
  // 只保留前N个分镜的摘要
  const relevantScenes = scenes.slice(
    Math.max(0, currentIndex - historyCount),
    currentIndex
  );
  
  if (relevantScenes.length === 0) {
    return { compressed: '', tokens: 0 };
  }
  
  const compressed = relevantScenes
    .map((scene, idx) => {
      const relative = currentIndex - historyCount + idx + 1;
      return `分镜${relative}: ${scene.summary.slice(0, 30)}${scene.summary.length > 30 ? '...' : ''}`;
    })
    .join('\n');
  
  return {
    compressed,
    tokens: estimateTokens(compressed),
  };
}

/**
 * 计算总上下文token数
 */
export function calculateTotalTokens(components: {
  system?: string;
  project?: string;
  history?: string;
  current?: string;
  task?: string;
}): number {
  let total = 0;
  for (const text of Object.values(components)) {
    if (text) {
      total += estimateTokens(text);
    }
  }
  return total;
}

/**
 * 检查是否超出token限制
 */
export function checkTokenLimit(
  totalTokens: number,
  maxTokens: number = 4000
): {
  withinLimit: boolean;
  usage: number;
  remaining: number;
} {
  return {
    withinLimit: totalTokens <= maxTokens,
    usage: (totalTokens / maxTokens) * 100,
    remaining: maxTokens - totalTokens,
  };
}

// ==========================================
// 辅助函数
// ==========================================

/**
 * 提取情绪基调（简化版）
 */
function extractMood(text: string): string {
  const moodKeywords: Record<string, string[]> = {
    '紧张': ['紧张', '危险', '追击', '逃亡', '危机'],
    '平静': ['平静', '宁静', '安详', '祥和', '和平'],
    '激动': ['激动', '兴奋', '热血', '激昂', '振奋'],
    '悲伤': ['悲伤', '哀伤', '痛苦', '失落', '绝望'],
    '欢乐': ['欢乐', '快乐', '愉快', '幸福', '开心'],
    '神秘': ['神秘', '诡异', '奇怪', '未知', '隐秘'],
  };
  
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return mood;
    }
  }
  
  return '中性';
}

/**
 * 提取关键元素（简化版）
 */
function extractKeyElement(text: string): string {
  // 提取名词性短语（简化：取前10个字符）
  const match = text.match(/[一-龥]{2,10}/);
  return match ? match[0] : text.slice(0, 10);
}

/**
 * 构建优化后的提示词上下文
 */
export function buildOptimizedContext(options: {
  project: Project;
  currentScene?: Scene;
  scenes?: Scene[];
  currentIndex?: number;
  strategy?: CompressionStrategy;
}): {
  context: string;
  tokens: number;
  breakdown: Record<string, number>;
} {
  const strategy = options.strategy || 'balanced';
  const breakdown: Record<string, number> = {};
  
  let context = '';
  
  // 1. 项目核心信息
  const projectEssence = compressProjectEssence(options.project, strategy);
  const projectContext = `# 项目信息
画风: ${projectEssence.style}
主角: ${projectEssence.protagonistCore}
故事: ${projectEssence.storyCore}
`;
  context += projectContext + '\n';
  breakdown.project = projectEssence.tokens;
  
  // 2. 历史上下文
  if (options.scenes && typeof options.currentIndex === 'number') {
    const history = compressSceneHistory(options.scenes, options.currentIndex, strategy);
    if (history.compressed) {
      context += `# 前序分镜\n${history.compressed}\n\n`;
      breakdown.history = history.tokens;
    }
  }
  
  // 3. 当前分镜
  if (options.currentScene) {
    const sceneSummary = compressSceneSummary(options.currentScene, strategy);
    const sceneContext = `# 当前分镜
概要: ${sceneSummary.summary}
${sceneSummary.mood ? `情绪: ${sceneSummary.mood}` : ''}
${sceneSummary.keyElement ? `关键元素: ${sceneSummary.keyElement}` : ''}
`;
    context += sceneContext + '\n';
    breakdown.scene = sceneSummary.tokens;
  }
  
  const totalTokens = calculateTotalTokens({
    project: projectContext,
    history: breakdown.history ? context : undefined,
    current: breakdown.scene ? context : undefined,
  });
  
  return {
    context,
    tokens: totalTokens,
    breakdown,
  };
}

// ==========================================
// AI Skill 定义
// ==========================================

/** 情绪提取技能 */
export const MoodExtractionSkill: Skill = {
  name: 'mood-extraction',
  description: '从文本中提取情绪基调',
  requiredContext: ['scene_description'],
  promptTemplate: `分析以下文本的情绪基调：

文本：{text}

请从以下情绪中选择最匹配的一个：
- 紧张（危险、追击、冒险）
- 平静（宁静、安详、日常）
- 激动（兴奋、热血、振奋）
- 悲伤（哀伤、失落、绝望）
- 欢乐（快乐、幸福、喜悦）
- 神秘（诡异、未知、悬疑）
- 浪漫（爱情、温馨、感动）
- 史诗（宏大、决战、命运）

直接输出情绪词，不要解释。`,
  outputFormat: { type: 'text', maxLength: 10 },
  maxTokens: 50,
};

/** 关键元素提取技能 */
export const KeyElementExtractionSkill: Skill = {
  name: 'key-element-extraction',
  description: '从文本中提取关键元素',
  requiredContext: ['scene_description'],
  promptTemplate: `分析以下场景文本，提取最重要的单一关键元素（人物/物件/地点/事件）：

文本：{text}

直接输出关键元素（2-6个字），不要解释。`,
  outputFormat: { type: 'text', maxLength: 20 },
  maxTokens: 50,
};

/** 智能摘要技能 */
export const SmartSummarySkill: Skill = {
  name: 'smart-summary',
  description: '智能压缩文本保留核心信息',
  requiredContext: ['project_essence'],
  promptTemplate: `将以下文本压缩到{target_length}字以内，保留最核心的信息：

原文：{text}

要求：
1. 保留关键人物、事件、地点
2. 去除冗余修饰词
3. 保持语义完整

直接输出压缩后的文本，不要解释。`,
  outputFormat: { type: 'text', maxLength: 200 },
  maxTokens: 300,
};

// ==========================================
// AI 客户端接口
// ==========================================
interface SimpleAIClient {
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>;
}

// ==========================================
// AI 智能版本函数
// ==========================================

/**
 * AI智能提取情绪（带fallback）
 */
export async function extractMoodWithAI(
  client: SimpleAIClient,
  text: string
): Promise<string> {
  try {
    const prompt = MoodExtractionSkill.promptTemplate.replace('{text}', text);
    const response = await client.chat([{ role: 'user', content: prompt }]);
    return response.content.trim();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('情绪提取', err, '关键词匹配');
    console.warn('AI情绪提取失败，回退到规则引擎:', error);
    return extractMood(text);
  }
}

/**
 * AI智能提取关键元素（带fallback）
 */
export async function extractKeyElementWithAI(
  client: SimpleAIClient,
  text: string
): Promise<string> {
  try {
    const prompt = KeyElementExtractionSkill.promptTemplate.replace('{text}', text);
    const response = await client.chat([{ role: 'user', content: prompt }]);
    return response.content.trim();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('关键元素提取', err, '文本截取');
    console.warn('AI关键元素提取失败，回退到规则引擎:', error);
    return extractKeyElement(text);
  }
}

/**
 * AI智能摘要压缩（带fallback）
 */
export async function compressTextWithAI(
  client: SimpleAIClient,
  text: string,
  targetLength: number
): Promise<string> {
  try {
    const prompt = SmartSummarySkill.promptTemplate
      .replace('{text}', text)
      .replace('{target_length}', String(targetLength));
    const response = await client.chat([{ role: 'user', content: prompt }]);
    return response.content.trim();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('文本压缩', err, '截断处理');
    console.warn('AI文本压缩失败，回退到截断:', error);
    return text.slice(0, targetLength) + (text.length > targetLength ? '...' : '');
  }
}

/**
 * AI智能压缩项目核心信息（带fallback）
 */
export async function compressProjectEssenceWithAI(
  client: SimpleAIClient,
  project: Project,
  strategy: CompressionStrategy = 'balanced'
): Promise<{
  style: string;
  protagonistCore: string;
  storyCore: string;
  tokens: number;
}> {
  const config = STRATEGY_CONFIG[strategy];
  
  try {
    // 风格保留
    const style = project.style;
    
    // AI压缩主角描述
    const protagonistCore = await compressTextWithAI(
      client,
      project.protagonist,
      Math.floor(config.maxProjectTokens * 0.3 / 2)
    );
    
    // AI压缩故事梗概
    const storyCore = await compressTextWithAI(
      client,
      project.summary,
      Math.floor(config.maxProjectTokens * 0.7 / 2)
    );
    
    return {
      style,
      protagonistCore,
      storyCore,
      tokens: estimateTokens(style) + estimateTokens(protagonistCore) + estimateTokens(storyCore),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('项目信息压缩', err, '规则引擎');
    console.warn('AI项目压缩失败，回退到规则引擎:', error);
    return compressProjectEssence(project, strategy);
  }
}

/**
 * AI智能压缩分镜摘要（带fallback）
 */
export async function compressSceneSummaryWithAI(
  client: SimpleAIClient,
  scene: Scene,
  strategy: CompressionStrategy = 'balanced'
): Promise<{
  summary: string;
  mood?: string;
  keyElement?: string;
  tokens: number;
}> {
  const config = STRATEGY_CONFIG[strategy];
  
  try {
    // AI压缩摘要
    const summary = await compressTextWithAI(
      client,
      scene.summary,
      Math.floor(config.maxSceneTokens / 2)
    );
    
    // AI提取情绪和关键元素
    const mood = await extractMoodWithAI(client, scene.summary);
    const keyElement = await extractKeyElementWithAI(client, scene.summary);
    
    return {
      summary,
      mood,
      keyElement,
      tokens: estimateTokens(summary),
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('分镜摘要压缩', err, '规则引擎');
    console.warn('AI分镜压缩失败，回退到规则引擎:', error);
    return compressSceneSummary(scene, strategy);
  }
}
