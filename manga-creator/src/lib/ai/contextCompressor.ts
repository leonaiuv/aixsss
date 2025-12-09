// ==========================================
// 上下文压缩器
// ==========================================
// 功能：
// 1. 智能压缩对话历史，保留关键信息
// 2. 动态调整token预算，避免超出API限制
// 3. 支持多种压缩策略（激进/平衡/保守）
// ==========================================

import { Project, Scene, CompressionStrategy } from '@/types';

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
